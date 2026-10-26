import { authorizePlatformAdmin, platformApiError } from '@/src/lib/server/platform-admin'
import { platformMutation, platformReadParams } from '@/src/lib/platform-admin'

export async function GET(request: Request) {
  try {
    const supabase = await authorizePlatformAdmin(request)
    const params = platformReadParams(new URL(request.url).searchParams)
    const { data, error } = await supabase.rpc('platform_admin_console', params)
    if (error) throw error
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return platformApiError(error) }
}

export async function POST(request: Request) {
  try {
    const supabase = await authorizePlatformAdmin(request)
    const { rpc, args } = platformMutation(await request.json())
    const { data, error } = await supabase.rpc(rpc, args)
    if (error) throw error
    return Response.json({ id: data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return platformApiError(error) }
}
