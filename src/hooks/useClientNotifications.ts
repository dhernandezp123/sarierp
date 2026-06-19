'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'

export function useClientNotifications(profileId: string | undefined) {
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!profileId) return

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('client_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .is('read_at', null)
      setUnreadCount(count ?? 0)
    }

    fetchUnread()

    // Real-time: re-fetch when a notification is inserted or updated for this profile
    const channel = supabase
      .channel(`client_notifications_${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_notifications',
          filter: `profile_id=eq.${profileId}`,
        },
        () => fetchUnread()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profileId])

  return { unreadCount }
}
