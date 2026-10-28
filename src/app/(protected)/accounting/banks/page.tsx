'use client'
import { useUser } from '@/src/hooks/useUser'
import { TreasuryWorkspace } from '@/src/components/accounting/TreasuryWorkspace'
export default function BanksPage(){const {user,profile}=useUser();return <TreasuryWorkspace key={`${user?.id}:${profile?.tenant_id}`}/>}
