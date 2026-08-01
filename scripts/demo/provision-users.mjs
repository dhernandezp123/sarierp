import { randomInt, randomUUID } from 'node:crypto'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'

import { createClient } from '@supabase/supabase-js'

const DEMO_PROJECT_REF = 'wlssekvxpfxhwedsjhpz'
const DEMO_ORIGIN = `https://${DEMO_PROJECT_REF}.supabase.co`
const DEMO_DATASET_VERSION = 'atlas-forwarding-demo-v1'
const ATLAS_CLIENT_ID = '10000000-0000-4000-8000-000000000001'
const DEMO_DURATION_HOURS = 72
const AUTH_PAGE_SIZE = 1000
const MAX_AUTH_PAGES = 100
const AUTH_DEMO_MARKER = 'forwarders-demo-provisioner-v1'

const PASSWORD_CHARACTERS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnopqrstuvwxyz',
  number: '23456789',
  symbol: '!@#$%*-_=+?',
}

function requireEnvironmentVariable(name) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(
      `Falta ${name}. Configurala solo en la sesion actual de la terminal; no uses un archivo .env.`
    )
  }

  return value
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

function resolveDemoClientId(rawClientId) {
  const configuredClientId = rawClientId?.trim().toLowerCase()

  if (configuredClientId && configuredClientId !== ATLAS_CLIENT_ID) {
    throw new Error(
      `DEMO_CLIENT_ID, si se define, debe ser exactamente ${ATLAS_CLIENT_ID}.`
    )
  }

  return ATLAS_CLIENT_ID
}

function parseSlotArgument(args) {
  const [flag, slot] = args

  if (args.length !== 2 || flag !== '--slot' || !/^0[1-5]$/.test(slot ?? '')) {
    throw new Error(
      'Uso: node scripts/demo/provision-users.mjs --slot 01 (slots permitidos: 01..05).'
    )
  }

  return slot
}

function randomCharacter(characters) {
  return characters[randomInt(0, characters.length)]
}

function generatePassword(length = 28) {
  const groups = Object.values(PASSWORD_CHARACTERS)
  const allCharacters = groups.join('')
  const password = groups.map(randomCharacter)

  while (password.length < length) {
    password.push(randomCharacter(allCharacters))
  }

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index + 1)
    ;[password[index], password[swapIndex]] = [password[swapIndex], password[index]]
  }

  return password.join('')
}

function buildAccounts(slot) {
  return [
    {
      slot,
      role: 'Admin',
      email: `demo-admin-${slot}@forwarders.app`,
      password: generatePassword(),
    },
    {
      slot,
      role: 'Cliente',
      email: `demo-cliente-${slot}@forwarders.app`,
      password: generatePassword(),
    },
  ]
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

async function requestTypedConfirmation(slot, clientId) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Este aprovisionador requiere una terminal interactiva para la confirmacion escrita.'
    )
  }

  const confirmationPhrase = `PROVISIONAR DEMO SLOT ${slot} ${DEMO_PROJECT_REF}`

  process.stdout.write(
    [
      '',
      'Se aprovisionara exclusivamente el ambiente demo:',
      `  Proyecto: ${DEMO_PROJECT_REF}`,
      `  URL: ${DEMO_ORIGIN}`,
      `  Slot: ${slot}`,
      '  Usuarios: 1 Admin + 1 Cliente',
      `  Cliente asociado: Atlas Forwarding Demo (${clientId})`,
      `  Vigencia: ${DEMO_DURATION_HOURS} horas desde esta ejecucion`,
      '  Se rotaran solo las dos cuentas de este slot.',
      '  Ambas cuentas recibiran un grant nuevo y deberan aceptar los terminos.',
      '',
      `Escribe exactamente: ${confirmationPhrase}`,
      '',
    ].join('\n')
  )

  const readline = createInterface({ input: process.stdin, output: process.stdout })

  try {
    const answer = await readline.question('Confirmacion: ')
    if (answer.trim() !== confirmationPhrase) {
      throw new Error('Confirmacion incorrecta. No se realizo ningun cambio.')
    }
  } finally {
    readline.close()
  }
}

async function readSentinel(supabase) {
  const { data, error } = await supabase
    .from('platform_environment')
    .select(
      'singleton, environment, project_ref, reset_enabled, reset_armed_at, dataset_version, dataset_seeded_at, dataset_client_id'
    )
    .eq('singleton', true)
    .single()

  if (error) {
    throw new Error(
      `No se pudo validar platform_environment. Aplica primero la migracion demo en staging: ${error.message}`
    )
  }

  const hasValidSeededAt = Number.isFinite(Date.parse(data.dataset_seeded_at ?? ''))
  const isReadyDataset =
    data.singleton === true
    && data.environment === 'demo'
    && data.project_ref === DEMO_PROJECT_REF
    && data.reset_enabled === false
    && data.reset_armed_at === null
    && data.dataset_version === DEMO_DATASET_VERSION
    && hasValidSeededAt
    && data.dataset_client_id === ATLAS_CLIENT_ID

  if (!isReadyDataset) {
    throw new Error(
      `El proyecto no tiene el dataset listo ${DEMO_DATASET_VERSION} para Atlas. Ejecuta primero reset-and-seed.mjs; no se cambio ninguna cuenta.`
    )
  }

  return data
}

async function validateClient(supabase, clientId) {
  if (!clientId) return

  const { data, error } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    throw new Error(`No se pudo validar DEMO_CLIENT_ID: ${error.message}`)
  }

  if (!data) {
    throw new Error(
      'DEMO_CLIENT_ID no corresponde a un cliente activo del proyecto demo. No se realizaron cambios.'
    )
  }
}

async function listAllAuthUsers(supabase) {
  const users = []

  for (let page = 1; page <= MAX_AUTH_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    })

    if (error) {
      throw new Error(`No se pudieron consultar los usuarios de Auth: ${error.message}`)
    }

    users.push(...data.users)

    if (data.users.length < AUTH_PAGE_SIZE) {
      return users
    }
  }

  throw new Error(
    `La consulta de Auth supero el limite seguro de ${MAX_AUTH_PAGES * AUTH_PAGE_SIZE} usuarios.`
  )
}

async function validateExistingDemoAccounts(supabase, accounts, usersByEmail) {
  const existingAccounts = accounts
    .map((account) => ({ account, user: usersByEmail.get(account.email) }))
    .filter(({ user }) => Boolean(user))

  if (existingAccounts.length === 0) return

  const userIds = existingAccounts.map(({ user }) => user.id)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, is_demo_user')
    .in('id', userIds)

  if (error) {
    throw new Error(`No se pudieron validar los perfiles existentes: ${error.message}`)
  }

  const profilesById = new Map(data.map((profile) => [profile.id, profile]))
  const unsafeAliases = existingAccounts
    .filter(({ user }) => {
      const profileIsDemo = profilesById.get(user.id)?.is_demo_user === true
      const wasCreatedByThisScript =
        user.app_metadata?.demo_provisioner === AUTH_DEMO_MARKER

      return !profileIsDemo && !wasCreatedByThisScript
    })
    .map(({ account }) => account.email)

  if (unsafeAliases.length > 0) {
    throw new Error(
      `Se encontraron alias reservados que no estan marcados como demo: ${unsafeAliases.join(', ')}. Revisalos manualmente; no se cambio ninguna cuenta.`
    )
  }
}

async function createOrUpdateAuthUser(
  supabase,
  account,
  existingUser,
  accessGrantId
) {
  const userMetadata = {
    ...(existingUser?.user_metadata ?? {}),
    nombre: 'Evaluador',
    apellido: account.slot,
    is_demo_user: true,
    demo_role: account.role,
    demo_slot: account.slot,
    demo_access_grant_id: accessGrantId,
  }

  const attributes = {
    email: account.email,
    password: account.password,
    email_confirm: true,
    // Auth permanece bloqueado hasta que las dos cuentas y sus perfiles hayan
    // sido preparados y verificados. La activacion ocurre al final del flujo.
    ban_duration: '8760h',
    app_metadata: {
      ...(existingUser?.app_metadata ?? {}),
      demo_provisioner: AUTH_DEMO_MARKER,
      demo_role: account.role,
      demo_slot: account.slot,
      demo_access_grant_id: accessGrantId,
    },
    user_metadata: userMetadata,
  }

  const { data, error } = existingUser
    ? await supabase.auth.admin.updateUserById(existingUser.id, attributes)
    : await supabase.auth.admin.createUser(attributes)

  if (error || !data.user) {
    throw new Error(
      `No se pudo ${existingUser ? 'actualizar' : 'crear'} ${account.email}: ${error?.message ?? 'respuesta sin usuario'}`
    )
  }

  return {
    action: existingUser ? 'actualizada' : 'creada',
    demoMarked: data.user.app_metadata?.demo_provisioner === AUTH_DEMO_MARKER,
    grantMarked:
      data.user.app_metadata?.demo_access_grant_id === accessGrantId
      && data.user.user_metadata?.demo_access_grant_id === accessGrantId,
    emailConfirmed: Boolean(data.user.email_confirmed_at),
    isBanned: (() => {
      const bannedUntil = Date.parse(data.user.banned_until ?? '')
      return Number.isFinite(bannedUntil) && bannedUntil > Date.now()
    })(),
    user: data.user,
  }
}

async function upsertProfile(
  supabase,
  account,
  userId,
  clientId,
  accessGrantId,
  now,
  expiresAt
) {
  const profile = {
    id: userId,
    nombre: 'Evaluador',
    apellido: account.slot,
    email: account.email,
    rol: account.role,
    status: 'Aprobado',
    approved_at: now,
    approved_by: null,
    is_active: false,
    cliente_id: account.role === 'Cliente' ? clientId : null,
    is_demo_user: true,
    demo_expires_at: expiresAt,
    demo_access_grant_id: accessGrantId,
    is_platform_admin: false,
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select(
      'id, nombre, apellido, email, rol, status, is_active, cliente_id, is_demo_user, demo_expires_at, demo_access_grant_id, is_platform_admin'
    )
    .single()

  if (error) {
    throw new Error(`No se pudo preparar el perfil de ${account.email}: ${error.message}`)
  }

  const expectedClientId = account.role === 'Cliente' ? clientId : null
  const hasExpectedExpiration =
    Date.parse(data.demo_expires_at) === Date.parse(expiresAt)
  const isExpectedProfile =
    data.id === userId
    && data.nombre === 'Evaluador'
    && data.apellido === account.slot
    && data.email === account.email
    && data.rol === account.role
    && data.status === 'Aprobado'
    && data.is_active === false
    && data.cliente_id === expectedClientId
    && data.is_demo_user === true
    && hasExpectedExpiration
    && data.demo_access_grant_id === accessGrantId
    && data.is_platform_admin === false

  if (!isExpectedProfile) {
    throw new Error(`La verificacion posterior del perfil de ${account.email} fallo.`)
  }

  return data
}

async function deactivateProfiles(supabase, userIds) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueUserIds.length === 0) return

  const { data, error } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .in('id', uniqueUserIds)
    .select('id, is_active')

  if (error) {
    throw new Error(`No se pudieron desactivar los perfiles del slot: ${error.message}`)
  }

  if (data.some((profile) => profile.is_active !== false)) {
    throw new Error('La verificacion de cierre de perfiles del slot fallo.')
  }
}

async function revokeSlotSessions(supabase, slot, userIds) {
  if (userIds.length !== 2 || new Set(userIds).size !== 2) {
    throw new Error('La revocacion requiere exactamente los dos usuarios del slot.')
  }

  const { data, error } = await supabase.rpc('revoke_demo_slot_sessions', {
    p_slot: slot,
    p_user_ids: userIds,
  })

  if (error) {
    throw new Error(`No se pudieron revocar las sesiones anteriores: ${error.message}`)
  }

  if (!Number.isInteger(data) || data < 0) {
    throw new Error('El servidor no confirmo la revocacion de sesiones del slot.')
  }

  return data
}

async function setAuthBan(supabase, userIds, shouldBan) {
  for (const userId of [...new Set(userIds.filter(Boolean))]) {
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: shouldBan ? '8760h' : 'none',
    })

    if (error || !data.user) {
      throw new Error(
        `No se pudo ${shouldBan ? 'bloquear' : 'habilitar'} Auth ${userId}: ${error?.message ?? 'respuesta sin usuario'}`
      )
    }

    const bannedUntil = Date.parse(data.user.banned_until ?? '')
    const isBanned = Number.isFinite(bannedUntil) && bannedUntil > Date.now()

    if (isBanned !== shouldBan) {
      throw new Error(
        `Auth no confirmo que ${userId} quedara ${shouldBan ? 'bloqueado' : 'habilitado'}.`
      )
    }
  }
}

async function activateProfiles(supabase, userIds, accessGrantId) {
  if (userIds.length !== 2 || new Set(userIds).size !== 2) {
    throw new Error('La activacion requiere exactamente los dos usuarios del slot.')
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ is_active: true })
    .in('id', userIds)
    .eq('is_demo_user', true)
    .eq('demo_access_grant_id', accessGrantId)
    .select('id, is_active, demo_access_grant_id')

  if (error) {
    throw new Error(`No se pudieron activar juntos los perfiles del slot: ${error.message}`)
  }

  const activatedIds = new Set(data.map((profile) => profile.id))
  const activationIsComplete =
    data.length === 2
    && userIds.every((userId) => activatedIds.has(userId))
    && data.every(
      (profile) =>
        profile.is_active === true
        && profile.demo_access_grant_id === accessGrantId
    )

  if (!activationIsComplete) {
    throw new Error('La verificacion de activacion conjunta del slot fallo.')
  }
}

async function leaveSlotFailClosed(supabase, accounts, knownUserIds) {
  const cleanupErrors = []
  const discoveredUserIds = new Set(knownUserIds.filter(Boolean))

  try {
    const users = await listAllAuthUsers(supabase)
    const reservedEmails = new Set(accounts.map((account) => account.email))
    for (const user of users) {
      if (user.email && reservedEmails.has(user.email.toLowerCase())) {
        discoveredUserIds.add(user.id)
      }
    }
  } catch (error) {
    cleanupErrors.push(
      `no se pudieron redescubrir las cuentas: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const userIds = [...discoveredUserIds]

  try {
    await deactivateProfiles(supabase, userIds)
  } catch (error) {
    cleanupErrors.push(
      `no se pudieron cerrar los perfiles: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  try {
    await setAuthBan(supabase, userIds, true)
  } catch (error) {
    cleanupErrors.push(
      `no se pudieron bloquear las cuentas Auth: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  return cleanupErrors
}

function revealCredentials(credentials, expiresAt) {
  const lines = [
    '',
    'CREDENCIALES DEMO (se muestran una sola vez)',
    `Vencimiento de perfiles: ${expiresAt}`,
  ]

  for (const credential of credentials) {
    lines.push(
      '',
      `${credential.role} - Evaluador ${credential.slot} (${credential.action})`,
      `  Usuario: ${credential.email}`,
      `  Contrasena: ${credential.password}`
    )
  }

  lines.push(
    '',
    'Guarda estas credenciales en un medio seguro y cierra esta terminal.'
  )

  process.stdout.write(`${lines.join('\n')}\n`)
}

async function main() {
  const slot = parseSlotArgument(process.argv.slice(2))
  const rawUrl = requireEnvironmentVariable('DEMO_SUPABASE_URL')
  const serviceRoleKey = requireEnvironmentVariable('DEMO_SUPABASE_SERVICE_ROLE_KEY')
  const clientId = resolveDemoClientId(process.env.DEMO_CLIENT_ID)
  const demoUrl = validateDemoUrl(rawUrl)
  validateServiceRoleKey(serviceRoleKey)

  const supabase = createAdminClient(demoUrl, serviceRoleKey)
  await readSentinel(supabase)
  await validateClient(supabase, clientId)
  await requestTypedConfirmation(slot, clientId)

  const existingUsers = await listAllAuthUsers(supabase)
  const usersByEmail = new Map(
    existingUsers
      .filter((user) => user.email)
      .map((user) => [user.email.toLowerCase(), user])
  )
  const accounts = buildAccounts(slot)
  await validateExistingDemoAccounts(supabase, accounts, usersByEmail)

  const now = new Date().toISOString()
  const expiresAt = new Date(
    Date.now() + DEMO_DURATION_HOURS * 60 * 60 * 1000
  ).toISOString()
  const accessGrantId = randomUUID()
  const preparedCredentials = []
  const managedUserIds = []

  // Cierra primero cualquier acceso anterior. Mientras el perfil este inactivo,
  // ningun JWT viejo puede atravesar el gate central de RLS.
  await deactivateProfiles(
    supabase,
    accounts
      .map((account) => usersByEmail.get(account.email)?.id)
      .filter(Boolean)
  )

  try {
    for (const account of accounts) {
      await readSentinel(supabase)
      const existingUser = usersByEmail.get(account.email)
      const {
        action,
        demoMarked,
        grantMarked,
        emailConfirmed,
        isBanned,
        user,
      } = await createOrUpdateAuthUser(supabase, account, existingUser, accessGrantId)

      managedUserIds.push(user.id)

      if (!emailConfirmed) {
        throw new Error(`Auth no confirmo el correo de ${account.email}.`)
      }

      if (!demoMarked) {
        throw new Error(`Auth no marco ${account.email} como cuenta del aprovisionador demo.`)
      }

      if (!grantMarked) {
        throw new Error(`Auth no aplico el grant compartido a ${account.email}.`)
      }

      if (!isBanned) {
        throw new Error(`Auth no mantuvo bloqueada la cuenta ${account.email}.`)
      }

      await upsertProfile(
        supabase,
        account,
        user.id,
        clientId,
        accessGrantId,
        now,
        expiresAt
      )
      preparedCredentials.push({ ...account, action })
      process.stdout.write(`${account.email}: preparada y verificada en estado bloqueado.\n`)
    }

    if (preparedCredentials.length !== 2 || managedUserIds.length !== 2) {
      throw new Error('No se prepararon las dos cuentas requeridas para el slot.')
    }

    const revokedSessions = await revokeSlotSessions(
      supabase,
      slot,
      managedUserIds
    )
    process.stdout.write(`Sesiones anteriores revocadas: ${revokedSessions}.\n`)

    await readSentinel(supabase)
    await setAuthBan(supabase, managedUserIds, false)
    await readSentinel(supabase)
    await activateProfiles(supabase, managedUserIds, accessGrantId)
  } catch (error) {
    const cleanupErrors = await leaveSlotFailClosed(
      supabase,
      accounts,
      managedUserIds
    )
    const baseMessage = error instanceof Error ? error.message : String(error)
    const cleanupMessage = cleanupErrors.length > 0
      ? ` Ademas, el cierre automatico tuvo problemas: ${cleanupErrors.join('; ')}. Revisa y bloquea manualmente el slot antes de continuar.`
      : ' Ambas cuentas quedaron bloqueadas y no se mostro ninguna credencial.'

    throw new Error(`${baseMessage}.${cleanupMessage}`)
  }

  revealCredentials(preparedCredentials, expiresAt)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`\nERROR: ${message}\n`)
  process.exitCode = 1
})
