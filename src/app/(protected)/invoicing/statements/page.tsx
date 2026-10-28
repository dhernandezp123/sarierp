'use client'
import { useUser } from '@/src/hooks/useUser'
import { FinanceReportWorkspace } from '@/src/components/accounting/FinanceReportWorkspace'
export default function StatementsPage(){const {user,profile}=useUser();return <FinanceReportWorkspace key={user?.id+':'+profile?.tenant_id} side="receivable" initialView="movements"/>}
