import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import { config } from '../config';

let client: MilvusClient | null = null;

export const COLLECTION_NAME = config.milvus.collection;
const VECTOR_DIM = 768; // nomic-embed-text output dimension

export async function getMilvusClient(): Promise<MilvusClient> {
  if (!client) {
    client = new MilvusClient({
      address: `${config.milvus.host}:${config.milvus.port}`,
    });
    await ensureCollection(client);
  }
  return client;
}

async function ensureCollection(c: MilvusClient): Promise<void> {
  const exists = await c.hasCollection({ collection_name: COLLECTION_NAME });
  if (exists.value) return;

  await c.createCollection({
    collection_name: COLLECTION_NAME,
    fields: [
      { name: 'id', data_type: DataType.Int64, is_primary_key: true, autoID: true },
      { name: 'chunk_uuid', data_type: DataType.VarChar, max_length: 36 },
      { name: 'document_id', data_type: DataType.VarChar, max_length: 36 },
      { name: 'subject_id', data_type: DataType.VarChar, max_length: 36 },
      { name: 'content', data_type: DataType.VarChar, max_length: 4096 },
      { name: 'embedding', data_type: DataType.FloatVector, dim: VECTOR_DIM },
    ],
  });

  await c.createIndex({
    collection_name: COLLECTION_NAME,
    field_name: 'embedding',
    index_type: 'IVF_FLAT',
    metric_type: 'COSINE',
    params: { nlist: 128 },
  });

  await c.loadCollection({ collection_name: COLLECTION_NAME });
  console.log(`Milvus collection "${COLLECTION_NAME}" created and loaded.`);
}

export interface ChunkRecord {
  chunk_uuid: string;
  document_id: string;
  subject_id: string;
  content: string;
  embedding: number[];
}

export async function insertChunks(chunks: ChunkRecord[]): Promise<number[]> {
  const c = await getMilvusClient();
  // Cast to any to satisfy the SDK's strict RowData constraint at runtime
  const result = await c.insert({
    collection_name: COLLECTION_NAME,
    data: chunks as any[],
  });
  const ids = result.IDs as any;
  return (ids?.int_id?.data as number[]) ?? [];
}

export interface SearchResult {
  chunk_uuid: string;
  document_id: string;
  content: string;
  score: number;
}

export async function searchSimilarChunks(
  queryEmbedding: number[],
  subjectId: string,
  topK = 5,
): Promise<SearchResult[]> {
  const c = await getMilvusClient();
  try {
    const results = await c.search({
      collection_name: COLLECTION_NAME,
      data: [queryEmbedding],
      filter: `subject_id == "${subjectId}"`,
      output_fields: ['chunk_uuid', 'document_id', 'content'],
      limit: topK,
      metric_type: 'COSINE',
    });
    return (results.results ?? []).map((r: any) => ({
      chunk_uuid: r.chunk_uuid,
      document_id: r.document_id,
      content: r.content,
      score: r.score,
    }));
  } catch (err: any) {
    // Milvus throws for empty collections; log clearly so it's diagnosable
    console.error('[Milvus] searchSimilarChunks failed:', err?.message ?? err);
    return [];
  }
}
