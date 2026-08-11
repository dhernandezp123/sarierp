import 'client-only'

import { supabase } from '@/src/lib/supabase/client'
import {
  sanitizeSupportFileName,
  SUPPORT_ATTACHMENT_BUCKET,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MIME_TYPES,
} from '@/src/lib/support'

export const SUPPORT_ATTACHMENT_MAX_FILES = 5

export function getSupportAttachmentValidationError(files: File[]) {
  if (files.length > SUPPORT_ATTACHMENT_MAX_FILES) {
    return `Puedes adjuntar hasta ${SUPPORT_ATTACHMENT_MAX_FILES} archivos`
  }

  for (const file of files) {
    if (!SUPPORT_ATTACHMENT_MIME_TYPES.includes(
      file.type as (typeof SUPPORT_ATTACHMENT_MIME_TYPES)[number]
    )) {
      return `${file.name}: formato no permitido`
    }

    if (file.size < 1 || file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
      return `${file.name}: el archivo debe pesar menos de 10 MB`
    }
  }

  return null
}

export async function uploadSupportAttachments({
  ticketId,
  messageId,
  userId,
  files,
}: {
  ticketId: string
  messageId: string
  userId: string
  files: File[]
}) {
  const failedFileNames: string[] = []

  for (const file of files) {
    const safeName = sanitizeSupportFileName(file.name)
    const filePath = `${ticketId}/${userId}/${crypto.randomUUID()}-${safeName}`
    const { error: uploadError } = await supabase.storage
      .from(SUPPORT_ATTACHMENT_BUCKET)
      .upload(filePath, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      failedFileNames.push(file.name)
      continue
    }

    const { error: metadataError } = await supabase
      .from('support_ticket_attachments')
      .insert({
        ticket_id: ticketId,
        message_id: messageId,
        uploaded_by: userId,
        file_name: file.name.slice(0, 180),
        file_path: filePath,
        mime_type: file.type,
        size_bytes: file.size,
      })

    if (metadataError) {
      await supabase.storage.from(SUPPORT_ATTACHMENT_BUCKET).remove([filePath])
      failedFileNames.push(file.name)
    }
  }

  return {
    uploadedCount: files.length - failedFileNames.length,
    failedFileNames,
  }
}
