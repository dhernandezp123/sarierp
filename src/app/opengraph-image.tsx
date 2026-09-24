import { ImageResponse } from 'next/og'
import {
  PLATFORM_MARKETING_NAME,
  PLATFORM_MARKETING_POSITIONING,
} from '@/src/lib/platform-branding'

export const alt = 'Forwarders.app, plataforma operativa para freight forwarders'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const stages = ['Cotización', 'Pricing', 'Operación', 'Rentabilidad']

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#07111F',
        color: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: -120,
          top: -180,
          width: 620,
          height: 620,
          borderRadius: 999,
          background: '#0D47C8',
          opacity: 0.45,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -180,
          bottom: -330,
          width: 620,
          height: 620,
          borderRadius: 999,
          background: '#EF8E01',
          opacity: 0.16,
        }}
      />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', padding: '62px 72px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', marginRight: 18, fontSize: 42, fontWeight: 800 }}>
            <span style={{ color: '#2C6DFF' }}>›</span>
            <span style={{ marginLeft: -9, color: '#FF9D16' }}>›</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 25, fontWeight: 700 }}>{PLATFORM_MARKETING_NAME}</span>
            <span style={{ marginTop: 5, color: '#9FB0CE', fontSize: 12, fontWeight: 700, letterSpacing: 1.8 }}>{PLATFORM_MARKETING_POSITIONING.toUpperCase()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 66, maxWidth: 960 }}>
          <span style={{ color: '#FFB44B', fontSize: 16, fontWeight: 700, letterSpacing: 2.4 }}>PARA FREIGHT FORWARDERS Y NVOCC</span>
          <span style={{ marginTop: 20, fontSize: 67, lineHeight: 1.03, fontWeight: 750, letterSpacing: -3.4 }}>
            De la cotización a la rentabilidad.
          </span>
          <span style={{ marginTop: 8, color: '#6E9CFF', fontSize: 67, lineHeight: 1.03, fontWeight: 750, letterSpacing: -3.4 }}>
            Una sola operación conectada.
          </span>
        </div>

        <div style={{ display: 'flex', marginTop: 'auto' }}>
          {stages.map((stage, index) => (
            <div
              key={stage}
              style={{
                display: 'flex',
                alignItems: 'center',
                marginRight: 12,
                padding: '11px 17px',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.06)',
                color: '#D8E2F3',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <span style={{ marginRight: 9, color: index === stages.length - 1 ? '#FFB44B' : '#6E9CFF', fontSize: 11 }}>0{index + 1}</span>
              {stage}
            </div>
          ))}
        </div>
      </div>
    </div>,
    size,
  )
}
