import { config } from '@/lib/config';
import { datasource } from '@/lib/datasource';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getUserByToken } from '@/lib/db/models/user';
import { log } from '@/lib/logger';
import { eq } from 'drizzle-orm';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import typedPlugin from '@/server/typedPlugin';

const logger = log('api').c('s3');

export const PATH = '/api/s3';
export default typedPlugin(
  async (server) => {
    server.addHook('onRequest', async (req, _res) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('AWS4-HMAC-SHA256')) {
        throw new S3Error(401, 'InvalidAccessKeyId', 'Invalid access key');
      }

      const credentialScope = authHeader.match(/Credential=([^,]+)/)?.[1];
      if (!credentialScope) {
        throw new S3Error(401, 'InvalidAccessKeyId', 'Missing credential scope');
      }

      const [accessKey] = credentialScope.split('/');
      const user = await getUserByToken(accessKey);
      if (!user) {
        throw new S3Error(401, 'InvalidAccessKeyId', 'Invalid access key');
      }

      (req as any).s3User = user;
      (req as any).s3Auth = parseAuthHeader(authHeader);

      // Verify signature
      if (!verifySignature(req, config.core.secret)) {
        throw new S3Error(403, 'SignatureDoesNotMatch', 'Signature does not match');
      }
    });

    server.route({
      method: ['GET', 'PUT', 'DELETE', 'HEAD', 'POST'],
      url: '/*',
      handler: async (req, res) => {
        const method = req.method;
        const params = req.params as { '*': string };
        const path = params['*'] || '';
        const query = req.query;

        try {
          if (method === 'GET' && path === '') {
            return handleListBuckets(req, res);
          }

          const [bucket, ...keyParts] = path.split('/');
          const key = keyParts.join('/');

          if (!bucket) {
            throw new S3Error(400, 'InvalidRequest', 'Bucket name required');
          }

          if (!key) {
            switch (method) {
              case 'GET':
                return handleListObjects(req, res, bucket, query);
              case 'PUT':
                return handleCreateBucket(req, res, bucket);
              case 'DELETE':
                return handleDeleteBucket(req, res, bucket);
              case 'HEAD':
                return handleHeadBucket(req, res, bucket);
            }
          }

          switch (method) {
            case 'GET':
              return handleGetObject(req, res, bucket, key, query);
            case 'PUT':
              return handlePutObject(req, res, bucket, key);
            case 'DELETE':
              return handleDeleteObject(req, res, bucket, key);
            case 'HEAD':
              return handleHeadObject(req, res, bucket, key);
            case 'POST':
              return handlePostObject(req, res, bucket, key, query);
          }

          throw new S3Error(405, 'MethodNotAllowed', 'Method not allowed');
        } catch (error) {
          if (error instanceof S3Error) {
            return res.status(error.statusCode).send(error.toXML());
          }
          logger.error('S3 API error', { error });
          throw new S3Error(500, 'InternalError', 'Internal server error');
        }
      },
    });
  },
  { name: PATH },
);

interface S3Auth {
  accessKey: string;
  signature: string;
  signedHeaders: string;
  credentialScope: string;
  date: string;
}

interface S3Request extends Record<string, unknown> {
  s3User?: { id: string; token: string; username: string };
  s3Auth?: S3Auth;
}

function parseAuthHeader(authHeader: string): S3Auth {
  const parts = authHeader.replace('AWS4-HMAC-SHA256 ', '').split(', ');
  const result: Partial<S3Auth> = {};

  for (const part of parts) {
    const [key, value] = part.split('=');
    switch (key) {
      case 'Credential':
        result.accessKey = value.split('/')[0];
        result.credentialScope = value;
        break;
      case 'Signature':
        result.signature = value;
        break;
      case 'SignedHeaders':
        result.signedHeaders = value;
        break;
    }
  }

  return result as S3Auth;
}

function getSignedHeaders(
  headers: Record<string, string | string[] | undefined>,
  signedHeaders: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of signedHeaders.split(';')) {
    const val = headers[h.toLowerCase()];
    if (val !== undefined) {
      result[h.toLowerCase()] = Array.isArray(val) ? val[0] : val;
    }
  }
  return result;
}

function canonicalRequest(
  method: string,
  path: string,
  query: Record<string, string | string[] | undefined>,
  headers: Record<string, string>,
  signedHeaders: string,
  payloadHash: string,
): string {
  const sortedQuery = Object.entries(query)
    .filter(([k]) => k !== 'authorization')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(v) ? v[0] : v)}`)
    .join('&');

  const canonicalHeaders = signedHeaders
    .split(';')
    .map((h) => `${h}:${headers[h.toLowerCase()]?.trim() || ''}`)
    .join('\n');

  return [method, path, sortedQuery, canonicalHeaders + '\n', signedHeaders, payloadHash].join('\n');
}

function stringToSign(
  algorithm: string,
  dateTime: string,
  credentialScope: string,
  canonicalRequestHash: string,
): string {
  return `${algorithm}\n${dateTime}\n${credentialScope}\n${canonicalRequestHash}`;
}

function getSignatureKey(secretKey: string, date: string, region: string, service: string): Buffer {
  const kDate = createHmac('sha256', `AWS4${secretKey}`).update(date).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update(service).digest();
  return createHmac('sha256', kService).update('aws4_request').digest();
}

function verifySignature(req: any, userSecret: string): boolean {
  const auth = req.s3Auth!;
  const headers = getSignedHeaders(
    req.headers as Record<string, string | string[] | undefined>,
    auth.signedHeaders,
  );
  const payloadHash = (req.headers['x-amz-content-sha256'] as string) || 'UNSIGNED-PAYLOAD';

  const canonical = canonicalRequest(
    req.method,
    req.routeOptions?.url || req.url,
    req.query as Record<string, string | string[] | undefined>,
    headers,
    auth.signedHeaders,
    payloadHash,
  );

  const canonicalHash = createHash('sha256').update(canonical).digest('hex');
  const stringToSignStr = stringToSign('AWS4-HMAC-SHA256', auth.date, auth.credentialScope, canonicalHash);
  const signingKey = getSignatureKey(userSecret, auth.date.split('T')[0].replace(/-/g, ''), 'auto', 's3');
  const expectedSignature = createHmac('sha256', signingKey).update(stringToSignStr).digest('hex');

  return timingSafeEqual(Buffer.from(auth.signature), Buffer.from(expectedSignature));
}

async function handleListBuckets(req: S3Request, res: any) {
  const user = req.s3User!;
  const userBuckets = await db
    .select({ id: users.id, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, user.id));

  const bucketsXml = userBuckets
    .map(
      (b) => `
      <Bucket>
        <Name>${b.id}</Name>
        <CreationDate>${b.createdAt.toISOString()}</CreationDate>
      </Bucket>
    `,
    )
    .join('');

  return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Owner>
    <ID>${user.id}</ID>
    <DisplayName>${user.username}</DisplayName>
  </Owner>
  <Buckets>
    ${bucketsXml}
  </Buckets>
</ListAllMyBucketsResult>`);
}

async function handleCreateBucket(req: S3Request, res: any, bucket: string) {
  const user = req.s3User!;
  if (bucket !== user.id) {
    throw new S3Error(403, 'AccessDenied', 'Cannot create bucket for another user');
  }
  return res.status(200).header('Location', `/${bucket}`).send('');
}

async function handleDeleteBucket(req: S3Request, res: any, bucket: string) {
  const user = req.s3User!;
  if (bucket !== user.id) {
    throw new S3Error(403, 'AccessDenied', 'Cannot delete bucket for another user');
  }
  await datasource.clear();
  return res.status(204).send('');
}

async function handleHeadBucket(req: S3Request, res: any, bucket: string) {
  const user = req.s3User!;
  if (bucket !== user.id) {
    throw new S3Error(403, 'AccessDenied', 'Cannot access bucket for another user');
  }
  return res.status(200).send('');
}

async function handleListObjects(req: any, res: any, bucket: string, query: any) {
  const user = req.s3User!;
  if (bucket !== user.id) {
    throw new S3Error(403, 'AccessDenied', 'Cannot access bucket for another user');
  }

  const prefix = query.prefix || '';
  const delimiter = query.delimiter || '/';
  const maxKeys = parseInt(query['max-keys'] || '1000', 10);

  const files = await datasource.list({ prefix });

  let contents: string[] = [];
  let commonPrefixes: string[] = [];

  if (delimiter) {
    const prefixSet = new Set<string>();
    for (const file of files) {
      if (!file.startsWith(prefix)) continue;
      const relative = file.slice(prefix.length);
      const idx = relative.indexOf(delimiter);
      if (idx >= 0) {
        const commonPrefix = prefix + relative.slice(0, idx + delimiter.length);
        prefixSet.add(commonPrefix);
      } else {
        contents.push(file);
      }
    }
    commonPrefixes = Array.from(prefixSet).sort();
  } else {
    contents = files.filter((f) => f.startsWith(prefix)).sort();
  }

  contents = contents.slice(0, maxKeys);

  const contentsXml = await Promise.all(
    contents.map(async (key) => {
      const size = await datasource.size(key);
      return `
    <Contents>
      <Key>${key}</Key>
      <LastModified>${new Date().toISOString()}</LastModified>
      <ETag>"${createHash('md5').update(key).digest('hex')}"</ETag>
      <Size>${size}</Size>
      <StorageClass>STANDARD</StorageClass>
    </Contents>`;
    }),
  ).then((arr) => arr.join(''));

  const commonPrefixesXml = commonPrefixes
    .map((p) => `<CommonPrefixes><Prefix>${p}</Prefix></CommonPrefixes>`)
    .join('');

  return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>${bucket}</Name>
  <Prefix>${prefix}</Prefix>
  <Marker></Marker>
  <MaxKeys>${maxKeys}</MaxKeys>
  <IsTruncated>${contents.length >= maxKeys ? 'true' : 'false'}</IsTruncated>
  ${contentsXml}
  ${commonPrefixesXml}
</ListBucketResult>`);
}

async function handleGetObject(req: any, res: any, bucket: string, key: string, query: any) {
  const user = req.s3User!;
  if (bucket !== user.id) {
    throw new S3Error(403, 'AccessDenied', 'Cannot access bucket for another user');
  }

  const stream = await datasource.get(key);
  if (!stream) {
    throw new S3Error(404, 'NoSuchKey', 'The specified key does not exist');
  }

  const size = await datasource.size(key);
  const etag = `"${createHash('md5').update(key).digest('hex')}"`;

  res.header('Content-Length', size);
  res.header('ETag', etag);
  res.header('Last-Modified', new Date().toUTCString());
  res.header('Accept-Ranges', 'bytes');

  if (query.responseContentType) {
    res.header('Content-Type', query.responseContentType);
  }

  return res.send(stream);
}

async function handlePutObject(req: any, res: any, bucket: string, key: string) {
  const user = (req as any).s3User!;
  if (bucket !== user.id) {
    throw new S3Error(403, 'AccessDenied', 'Cannot access bucket for another user');
  }

  const headers = req.headers;
  const body = req.body;
  const mimetype = headers['content-type'] || 'application/octet-stream';

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    await datasource.put(key, Buffer.concat(chunks), { mimetype });
  } else {
    await datasource.put(key, body, { mimetype });
  }

  const etag = `"${createHash('md5').update(key).digest('hex')}"`;
  return res.status(200).header('ETag', etag).send('');
}

async function handleDeleteObject(req: any, res: any, bucket: string, key: string) {
  const user = (req as any).s3User!;
  if (bucket !== user.id) {
    throw new S3Error(403, 'AccessDenied', 'Cannot access bucket for another user');
  }

  await datasource.delete(key);
  return res.status(204).send('');
}

async function handleHeadObject(req: any, res: any, bucket: string, key: string) {
  const user = (req as any).s3User!;
  if (bucket !== user.id) {
    throw new S3Error(403, 'AccessDenied', 'Cannot access bucket for another user');
  }

  const size = await datasource.size(key);
  if (size === 0) {
    throw new S3Error(404, 'NoSuchKey', 'The specified key does not exist');
  }

  const etag = `"${createHash('md5').update(key).digest('hex')}"`;
  return res
    .header('Content-Length', size)
    .header('ETag', etag)
    .header('Last-Modified', new Date().toUTCString())
    .header('Accept-Ranges', 'bytes')
    .status(200)
    .send('');
}

async function handlePostObject(req: any, res: any, bucket: string, key: string, query: any) {
  const user = (req as any).s3User!;
  if (bucket !== user.id) {
    throw new S3Error(403, 'AccessDenied', 'Cannot access bucket for another user');
  }

  if (query.uploads) {
    return handleCreateMultipartUpload(req, res, bucket, key);
  }

  if (query.partNumber && query.uploadId) {
    return handleUploadPart(req, res, bucket, key, query);
  }

  if (query.uploadId && query['x-amz-mp-object']) {
    return handleCompleteMultipartUpload(req, res, bucket, key, query);
  }

  throw new S3Error(400, 'InvalidRequest', 'Invalid multipart upload request');
}

async function handleCreateMultipartUpload(req: any, res: any, bucket: string, key: string) {
  const uploadId = createHash('sha256').update(`${key}${Date.now()}`).digest('hex').slice(0, 32);
  return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>${bucket}</Bucket>
  <Key>${key}</Key>
  <UploadId>${uploadId}</UploadId>
</InitiateMultipartUploadResult>`);
}

async function handleUploadPart(req: any, res: any, bucket: string, key: string, query: any) {
  const partNumber = parseInt(query.partNumber, 10);
  const uploadId = query.uploadId;

  const _headers = req.headers;
  const body = req.body;

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    await datasource.put(`${key}.part.${partNumber}.${uploadId}`, Buffer.concat(chunks));
  } else {
    await datasource.put(`${key}.part.${partNumber}.${uploadId}`, body);
  }

  const etag = `"${createHash('md5').update(`${key}${partNumber}${uploadId}`).digest('hex')}"`;
  return res.status(200).header('ETag', etag).send('');
}

async function handleCompleteMultipartUpload(req: any, res: any, bucket: string, key: string, query: any) {
  const uploadId = query.uploadId;

  const parts = await datasource.list({ prefix: `${key}.part.${uploadId}` });
  parts.sort((a, b) => {
    const aNum = parseInt(a.split('.part.')[1].split('.')[0], 10);
    const bNum = parseInt(b.split('.part.')[1].split('.')[0], 10);
    return aNum - bNum;
  });

  const finalBuffers: Buffer[] = [];
  for (const part of parts) {
    const stream = await datasource.get(part);
    if (stream) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      finalBuffers.push(Buffer.concat(chunks));
    }
    await datasource.delete(part);
  }

  await datasource.put(key, Buffer.concat(finalBuffers));

  const etag = `"${createHash('md5').update(key).digest('hex')}"`;
  return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Location>/${bucket}/${key}</Location>
  <Bucket>${bucket}</Bucket>
  <Key>${key}</Key>
  <ETag>${etag}</ETag>
</CompleteMultipartUploadResult>`);
}

class S3Error extends Error {
  code: string;
  statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }

  toXML(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>${this.code}</Code>
  <Message>${this.message}</Message>
  <Resource>${this.message}</Resource>
  <RequestId>${createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 16)}</RequestId>
</Error>`;
  }
}
