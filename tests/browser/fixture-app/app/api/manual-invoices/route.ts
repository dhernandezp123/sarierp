export function GET() { return Response.json({ documents:[], total:0, nextOffset:0, hasMore:false }) }
export function POST() { return Response.json({ error:'Fallo sintético de guardado' }, { status:503 }) }
