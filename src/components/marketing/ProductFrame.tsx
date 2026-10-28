import Image from 'next/image'

type ProductFrameProps = {
  src: string
  alt: string
  label: string
  sizes?: string
  imageClassName?: string
}

export function ProductFrame({
  src,
  alt,
  label,
  sizes = '(max-width: 1024px) 100vw, 720px',
  imageClassName = 'aspect-video h-auto w-full object-contain',
}: ProductFrameProps) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-45px_rgba(15,41,94,0.55)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#16A36A]" />
          {label}
        </span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-800">
          Datos Demo
        </span>
      </div>
      <div className="overflow-hidden bg-[#F5F8FC]">
        <Image
          src={src}
          alt={alt}
          width={1920}
          height={1080}
          sizes={sizes}
          loading="lazy"
          className={imageClassName}
        />
      </div>
    </figure>
  )
}
