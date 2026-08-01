import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'

import { createClient } from '@supabase/supabase-js'

const DEMO_PROJECT_REF = 'wlssekvxpfxhwedsjhpz'
const DEMO_ORIGIN = `https://${DEMO_PROJECT_REF}.supabase.co`
const DEMO_DATASET_VERSION = 'atlas-forwarding-demo-v1'
const ATLAS_CLIENT_ID = '10000000-0000-4000-8000-000000000001'
const CONFIRMATION_PHRASE = `RESET Y SEMBRAR DEMO ${DEMO_PROJECT_REF}`
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BOOTSTRAP_EMAIL = 'demo-bootstrap@forwarders.app'
const BOOTSTRAP_MARKER = 'forwarders-demo-bootstrap-v1'
const AUTH_PAGE_SIZE = 1000
const MAX_AUTH_PAGES = 100

function requireEnvironmentVariable(name) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(
      `Falta ${name}. Configurala solo en esta terminal; no uses un archivo .env.`
    )
  }

  return value
}

function validateNoArguments(args) {
  if (args.length !== 0) {
    throw new Error('Uso: node scripts/demo/reset-and-seed.mjs')
  }
}

function validateDemoUrl(rawUrl) {
  let parsedUrl

  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    throw new Error('DEMO_SUPABASE_URL no es una URL valida.')
  }

  const hasUnexpectedParts =
    parsedUrl.origin !== DEMO_ORIGIN
    || parsedUrl.pathname !== '/'
    || parsedUrl.search !== ''
    || parsedUrl.hash !== ''
    || parsedUrl.username !== ''
    || parsedUrl.password !== ''

  if (hasUnexpectedParts) {
    throw new Error(
      `DEMO_SUPABASE_URL debe ser exactamente ${DEMO_ORIGIN}. Se rechazo cualquier otro proyecto.`
    )
  }

  return DEMO_ORIGIN
}

function decodeJwtPayload(jwt) {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function validateServiceRoleKey(key) {
  if (key.startsWith('sb_secret_')) return

  const payload = decodeJwtPayload(key)
  if (payload?.role !== 'service_role') {
    throw new Error(
      'DEMO_SUPABASE_SERVICE_ROLE_KEY no parece una clave service_role/secret valida.'
    )
  }

  if (payload.ref && payload.ref !== DEMO_PROJECT_REF) {
    throw new Error(
      `La service role key declara el project ref ${payload.ref}; se esperaba ${DEMO_PROJECT_REF}.`
    )
  }
}

function createAdminClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}

async function readSentinel(supabase) {
  const { data, error } = await supabase
    .from('platform_environment')
    .select(
      'singleton, environment, project_ref, reset_enabled, reset_nonce, reset_armed_at, dataset_version, dataset_seeded_at, dataset_client_id'
    )
    .eq('singleton', true)
    .single()

  if (error) {
    throw new Error(
      `No se pudo leer platform_environment. Aplica primero las migraciones demo: ${error.message}`
    )
  }

  return data
}

function validatePreflightSentinel(sentinel) {
  if (sentinel.singleton !== true) {
    throw new Error('El sentinel demo no es la fila singleton esperada.')
  }

  if (sentinel.environment === 'customer') {
    throw new Error(
      'El sentinel identifica un ambiente customer. El reset se rechazo sin hacer cambios.'
    )
  }

  if (!['production', 'demo'].includes(sentinel.environment)) {
    throw new Error(`Ambiente no permitido para reset: ${sentinel.environment}.`)
  }

  if (sentinel.project_ref && sentinel.project_ref !== DEMO_PROJECT_REF) {
    throw new Error(
      `El sentinel pertenece a ${sentinel.project_ref}; se esperaba ${DEMO_PROJECT_REF}.`
    )
  }
}

async function requestTypedConfirmation(sentinel) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'El reset requiere una terminal interactiva para la confirmacion escrita.'
    )
  }

  process.stdout.write(
    [
      '',
      'ADVERTENCIA: se reemplazaran los datos operativos del sandbox demo.',
      `  Proyecto unico permitido: ${DEMO_PROJECT_REF}`,
      `  URL unica permitida: ${DEMO_ORIGIN}`,
      `  Ambiente actual: ${sentinel.environment}`,
      '  Se conservan Auth, profiles, leads y los historiales legales demo.',
      '  Los objetos de Storage se conservan, pero quedan bloqueados en demo.',
      `  Dataset nuevo: ${DEMO_DATASET_VERSION}`,
      `  Cliente ficticio: Atlas Forwarding Demo (${ATLAS_CLIENT_ID})`,
      '',
      `Escribe exactamente: ${CONFIRMATION_PHRASE}`,
      '',
    ].join('\n')
  )

  const readline = createInterface({ input: process.stdin, output: process.stdout })

  try {
    const answer = await readline.question('Confirmacion: ')
    if (answer.trim() !== CONFIRMATION_PHRASE) {
      throw new Error('Confirmacion incorrecta. No se realizo ningun cambio.')
    }
  } finally {
    readline.close()
  }
}

async function activateDemoSentinel(supabase) {
  const { data, error } = await supabase
    .from('platform_environment')
    .update({
      environment: 'demo',
      project_ref: DEMO_PROJECT_REF,
      updated_at: new Date().toISOString(),
    })
    .eq('singleton', true)
    .in('environment', ['production', 'demo'])
    .or(`project_ref.is.null,project_ref.eq.${DEMO_PROJECT_REF}`)
    .select(
      'singleton, environment, project_ref, reset_enabled, reset_nonce, reset_armed_at'
    )
    .single()

  if (error) {
    throw new Error(`No se pudo activar el sentinel demo: ${error.message}`)
  }

  if (
    data.singleton !== true
    || data.environment !== 'demo'
    || data.project_ref !== DEMO_PROJECT_REF
  ) {
    throw new Error('La verificacion del sentinel demo activado fallo.')
  }

  return data
}

async function listAllAuthUsers(supabase) {
  const users = []

  for (let page = 1; page <= MAX_AUTH_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    })

    if (error) {
      throw new Error(`No se pudo buscar el usuario bootstrap: ${error.message}`)
    }

    users.push(...data.users)
    if (data.users.length < AUTH_PAGE_SIZE) return users
  }

  throw new Error(
    `Auth supero el limite seguro de ${MAX_AUTH_PAGES * AUTH_PAGE_SIZE} usuarios.`
  )
}

async function ensureTechnicalBootstrap(supabase) {
  const users = await listAllAuthUsers(supabase)
  const existingUser = users.find(
    (user) => user.email?.toLowerCase() === BOOTSTRAP_EMAIL
  )

  if (
    existingUser
    && existingUser.app_metadata?.demo_bootstrap_provisioner !== BOOTSTRAP_MARKER
  ) {
    throw new Error(
      `${BOOTSTRAP_EMAIL} ya existe y no pertenece al bootstrap demo. Requiere revision manual.`
    )
  }

  const password = `${randomUUID()}Aa9!`
  const attributes = {
    email: BOOTSTRAP_EMAIL,
    password,
    email_confirm: true,
    ban_duration: '8760h',
    app_metadata: {
      ...(existingUser?.app_metadata ?? {}),
      demo_bootstrap_provisioner: BOOTSTRAP_MARKER,
      access_purpose: 'seed_actor_only',
    },
    user_metadata: {
      ...(existingUser?.user_metadata ?? {}),
      nombre: 'Demo',
      apellido: 'Bootstrap tecnico',
      access_purpose: 'seed_actor_only',
    },
  }

  const { data, error } = existingUser
    ? await supabase.auth.admin.updateUserById(existingUser.id, attributes)
    : await supabase.auth.admin.createUser(attributes)

  if (error || !data.user) {
    throw new Error(
      `No se pudo asegurar el usuario bootstrap: ${error?.message ?? 'respuesta sin usuario'}`
    )
  }

  const bannedUntil = Date.parse(data.user.banned_until ?? '')
  if (
    data.user.app_metadata?.demo_bootstrap_provisioner !== BOOTSTRAP_MARKER
    || !Number.isFinite(bannedUntil)
    || bannedUntil <= Date.now()
  ) {
    throw new Error('Auth no dejo el usuario bootstrap marcado y bloqueado.')
  }

  const profile = {
    id: data.user.id,
    nombre: 'Demo',
    apellido: 'Bootstrap tecnico',
    email: BOOTSTRAP_EMAIL,
    rol: 'Admin',
    status: 'Rechazado',
    approved_at: null,
    approved_by: null,
    is_active: false,
    cliente_id: null,
    is_demo_user: false,
    demo_expires_at: null,
    demo_access_grant_id: null,
    is_platform_admin: false,
  }

  const { data: savedProfile, error: profileError } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select(
      'id, email, rol, status, is_active, cliente_id, is_demo_user, demo_expires_at, demo_access_grant_id, is_platform_admin'
    )
    .single()

  if (profileError) {
    throw new Error(`No se pudo cerrar el perfil bootstrap: ${profileError.message}`)
  }

  const isSafeProfile =
    savedProfile.id === data.user.id
    && savedProfile.email?.toLowerCase() === BOOTSTRAP_EMAIL
    && savedProfile.rol === 'Admin'
    && savedProfile.status === 'Rechazado'
    && savedProfile.is_active === false
    && savedProfile.cliente_id === null
    && savedProfile.is_demo_user === false
    && savedProfile.demo_expires_at === null
    && savedProfile.demo_access_grant_id === null
    && savedProfile.is_platform_admin === false

  if (!isSafeProfile) {
    throw new Error('La verificacion del perfil bootstrap inactivo fallo.')
  }

  return data.user.id
}

async function armReset(supabase) {
  const { data, error } = await supabase.rpc('arm_demo_reset', {
    p_confirmation: CONFIRMATION_PHRASE,
  })

  if (error) {
    throw new Error(`No se pudo armar el reset demo: ${error.message}`)
  }

  if (typeof data !== 'string' || !UUID_PATTERN.test(data)) {
    throw new Error('El servidor no devolvio un nonce de reset valido.')
  }

  return data.toLowerCase()
}

async function executeResetAndSeed(supabase, resetNonce) {
  const { data, error } = await supabase.rpc('reset_and_seed_demo', {
    p_confirmation: CONFIRMATION_PHRASE,
    p_reset_nonce: resetNonce,
  })

  if (error) {
    throw new Error(`El RPC de reset fallo: ${error.message}`)
  }

  if (!data || typeof data !== 'object' || data.ok !== true) {
    const serverError = data?.error ?? 'respuesta de reset no valida'
    const serverDetail = data?.detail ? ` Detalle: ${data.detail}` : ''
    throw new Error(`El reset se revirtio: ${serverError}.${serverDetail}`)
  }

  return data
}

async function verifyReadyDataset(supabase, consumedNonce) {
  const sentinel = await readSentinel(supabase)
  const hasValidSeededAt = Number.isFinite(
    Date.parse(sentinel.dataset_seeded_at ?? '')
  )
  const isReady =
    sentinel.environment === 'demo'
    && sentinel.project_ref === DEMO_PROJECT_REF
    && sentinel.reset_enabled === false
    && sentinel.reset_armed_at === null
    && sentinel.reset_nonce !== consumedNonce
    && sentinel.dataset_version === DEMO_DATASET_VERSION
    && hasValidSeededAt
    && sentinel.dataset_client_id === ATLAS_CLIENT_ID

  if (!isReady) {
    throw new Error(
      'El reset respondio OK, pero la verificacion final del dataset/sentinel fallo.'
    )
  }

  return sentinel
}

async function disarmFailedReset(supabase, resetNonce) {
  const { data, error } = await supabase
    .from('platform_environment')
    .update({
      reset_enabled: false,
      reset_nonce: randomUUID(),
      reset_armed_at: null,
      dataset_version: null,
      dataset_seeded_at: null,
      dataset_client_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('singleton', true)
    .eq('environment', 'demo')
    .eq('project_ref', DEMO_PROJECT_REF)
    .eq('reset_nonce', resetNonce)
    .select('singleton')

  if (error) {
    throw new Error(`No se pudo desarmar el reset fallido: ${error.message}`)
  }

  return data.length === 1
}

function printResult(result, sentinel) {
  const counts = result.counts ?? {}

  process.stdout.write(
    [
      '',
      'RESET DEMO COMPLETADO',
      `  Dataset: ${sentinel.dataset_version}`,
      `  Sembrado: ${sentinel.dataset_seeded_at}`,
      `  Cliente: Atlas Forwarding Demo (${sentinel.dataset_client_id})`,
      `  Perfiles Cliente vinculados: ${result.linked_client_profiles ?? 0}`,
      `  Cotizaciones: ${counts.quotations ?? 0}`,
      `  Embarques / bookings: ${counts.shipments ?? 0} / ${counts.bookings ?? 0}`,
      `  Facturas: ${counts.invoices ?? 0}`,
      `  Paquetes Miami: ${counts.miami_packages ?? 0}`,
      `  Objetos Storage preservados y bloqueados: ${result.storage_objects_preserved ?? 0}`,
      `  Buckets conocidos forzados a privados: ${result.storage_buckets_forced_private ?? 0}`,
      '',
      'Siguiente paso: aprovisiona solamente el slot que entregaras al cliente.',
    ].join('\n')
  )
}

async function main() {
  validateNoArguments(process.argv.slice(2))
  const rawUrl = requireEnvironmentVariable('DEMO_SUPABASE_URL')
  const serviceRoleKey = requireEnvironmentVariable(
    'DEMO_SUPABASE_SERVICE_ROLE_KEY'
  )
  const demoUrl = validateDemoUrl(rawUrl)
  validateServiceRoleKey(serviceRoleKey)

  const supabase = createAdminClient(demoUrl, serviceRoleKey)
  const preflightSentinel = await readSentinel(supabase)
  validatePreflightSentinel(preflightSentinel)
  await requestTypedConfirmation(preflightSentinel)

  let armedNonce = null

  try {
    await activateDemoSentinel(supabase)
    await ensureTechnicalBootstrap(supabase)
    process.stdout.write('Actor bootstrap tecnico verificado, bloqueado e inactivo.\n')
    armedNonce = await armReset(supabase)
    process.stdout.write('Reset armado; ejecutando transaccion y dataset ficticio...\n')

    const result = await executeResetAndSeed(supabase, armedNonce)
    const readySentinel = await verifyReadyDataset(supabase, armedNonce)
    armedNonce = null
    printResult(result, readySentinel)
  } catch (error) {
    if (armedNonce) {
      try {
        const wasDisarmed = await disarmFailedReset(supabase, armedNonce)
        if (wasDisarmed) {
          process.stderr.write(
            'El reset fallido fue desarmado y el dataset quedo marcado como no listo.\n'
          )
        }
      } catch (disarmError) {
        const disarmMessage =
          disarmError instanceof Error ? disarmError.message : String(disarmError)
        process.stderr.write(`ERROR ADICIONAL: ${disarmMessage}\n`)
      }
    }

    throw error
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`\nERROR: ${message}\n`)
  process.exitCode = 1
})
