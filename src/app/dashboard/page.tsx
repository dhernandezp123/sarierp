'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '../../hooks/useUser'
import AppLayout from '../../components/layout/app-layout'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'

import {
  Badge,
} from '../../components/ui/badge'

export default function DashboardPage() {
  const router = useRouter()
  const { user, profile, loading } = useUser()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [loading, user, router])

  if (loading) {
    return <div className="p-8">Cargando...</div>
  }

  return (
  <AppLayout role={profile?.rol || 'Ventas'}>

    <div className="space-y-8">

      <div>
        <h1 className="text-4xl font-bold">
          Dashboard Sari Express
        </h1>

        <p className="text-gray-500 mt-2">
          Bienvenido nuevamente al sistema logístico.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-6">

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">
              Cotizaciones
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold">
              24
            </div>

            <Badge className="mt-2">
              +12% este mes
            </Badge>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">
              Clientes
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold">
              8
            </div>

            <Badge className="mt-2 bg-blue-600">
              Activos
            </Badge>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">
              Ganadas
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold">
              5
            </div>

            <Badge className="mt-2 bg-green-600">
              Confirmadas
            </Badge>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">
              Pendientes
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold">
              11
            </div>

            <Badge className="mt-2 bg-orange-500">
              Seguimiento
            </Badge>
          </CardContent>
        </Card>

      </div>

      <Card className="rounded-2xl shadow-sm">

        <CardHeader>
          <CardTitle className='font-bold'>
            Actividad Reciente
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">

          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <p className="font-medium">
                Nueva cotización creada
              </p>

              <p className="text-sm text-gray-500">
                SARIHN-2605-0003-AP
              </p>
            </div>

            <Badge>
              Nueva
            </Badge>
          </div>

          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <p className="font-medium">
                Cliente agregado
              </p>

              <p className="text-sm text-gray-500">
                Inversiones Dennis
              </p>
            </div>

            <Badge className="bg-blue-600">
              Cliente
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                Cotización ganada
              </p>

              <p className="text-sm text-gray-500">
                SARIHN-2605-0001-AP
              </p>
            </div>

            <Badge className="bg-green-600">
              Ganada
            </Badge>
          </div>

        </CardContent>

      </Card>

    </div>

  </AppLayout>
)
}