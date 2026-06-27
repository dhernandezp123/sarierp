'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function BrandIntro() {
  // empieza en null para no romper la hidratación de Next
  const [show, setShow] = useState<boolean | null>(null)

  useEffect(() => {
    const seen = sessionStorage.getItem('fwd_intro_seen')
    if (seen) { setShow(false); return }
    sessionStorage.setItem('fwd_intro_seen', '1')
    setShow(true)
    const t = setTimeout(() => setShow(false), 2200)
    return () => clearTimeout(t)
  }, [])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#07111F]"
        >
          <div className="flex items-center gap-6">
            <motion.div
              initial={{ opacity: 0, x: -46, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.9, ease: [0.2, 0.85, 0.25, 1] }}
              className="relative h-[88px] w-[88px]"
            >
              <span className="absolute left-[6px] top-[15px] h-[58px] w-[40px] bg-[#0038BD]/90"
                    style={{ clipPath: 'polygon(0 0,54% 0,100% 50%,54% 100%,0 100%,46% 50%)' }} />
              <span className="absolute left-[35px] top-[15px] h-[58px] w-[40px] bg-[#EF8E01]"
                    style={{ clipPath: 'polygon(0 0,54% 0,100% 50%,54% 100%,0 100%,46% 50%)' }} />
            </motion.div>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.42, ease: [0.2, 0.85, 0.25, 1] }}
              className="text-6xl font-bold tracking-tight text-white"
            >
              Forwarders<span className="text-[#EF8E01]"> ERP</span>
            </motion.span>
          </div>
          <motion.div
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.9, ease: [0.2, 0.85, 0.25, 1] }}
            className="mt-7 h-0.5 w-[300px] origin-left rounded-full bg-gradient-to-r from-[#0038BD] to-[#EF8E01]"
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}