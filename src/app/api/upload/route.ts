import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';
import { connectDB } from '@/app/lib/mongodb';
import Chat from '@/app/lib/models/ChatModel';
import { validateFile, uploadFileToCloudinary, ACCEPTED_TYPES } from '@/lib/fileUpload';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ✅ Groq embeddings
async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.groq.com/openai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY!}`,
    },
    body: JSON.stringify({
      model: 'nomic-embed-text-v1_5',
      input: text,
    }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

export async function POST(req: NextRequest) {
  // ── Verify Firebase Token ──────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid = '', email = '';
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email ?? '';
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // ── Parse FormData ─────────────────────────────────────────
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const sessionId = formData.get('sessionId') as string;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!sessionId) return NextResponse.json({ error: 'No sessionId provided' }, { status: 400 });

  // ── Validate file ──────────────────────────────────────────
  const validation = validateFile(file);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    // ── Upload to Cloudinary ───────────────────────────────
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const { url, publicId } = await uploadFileToCloudinary(buffer, file.name, file.type);

    const fileInfo = ACCEPTED_TYPES[file.type];
    const isPDF = file.type === 'application/pdf';

    // ── If PDF → process with LangChain ───────────────────
    let pdfChunks = 0;
    if (isPDF) {
      try {
        // Save temp file
        const tmpPath = path.join(os.tmpdir(), `${Date.now()}.pdf`);
        fs.writeFileSync(tmpPath, buffer);

        // Load + split PDF
        const loader = new PDFLoader(tmpPath);
        const docs = await loader.load();

        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200,
        });
        const chunks = await splitter.splitDocuments(docs);
        pdfChunks = chunks.length;

        // Store embeddings in MongoDB
        const conn = await connectDB();
        if (!conn.connection.db) throw new Error('Database not initialized');
        const collection = conn.connection.db.collection('pdfdocs');

        const docsToInsert = await Promise.all(
          chunks.map(async (chunk) => {
            const embedding = await getEmbedding(chunk.pageContent);
            return {
              userId: uid,
              sessionId,
              fileName: file.name,
              cloudinaryUrl: url,
              content: chunk.pageContent,
              embedding,
              createdAt: new Date(),
            };
          })
        );

        await collection.insertMany(docsToInsert);

        // Cleanup temp file
        fs.unlinkSync(tmpPath);

        console.log(`[PDF] Processed ${pdfChunks} chunks for ${file.name}`);
      } catch (pdfErr: any) {
        console.error('[PDF Processing Error]', pdfErr);
        // Don't fail the whole upload if PDF processing fails
      }
    }

    // ── Save to MongoDB chat ───────────────────────────────
    await connectDB();
    await Chat.findOneAndUpdate(
      { sessionId, userId: uid },
      {
        $set: { userEmail: email },
        $setOnInsert: { title: `📎 ${file.name.slice(0, 40)}` },
        $push: {
          messages: {
            $each: [
              {
                role: 'user',
                content: `Uploaded file: ${file.name}`,
                fileUrl: url,
                fileName: file.name,
                fileType: fileInfo.ext,
                fileSize: file.size,
                publicId,
                timestamp: new Date(),
              },
              {
                role: 'assistant',
                content: isPDF && pdfChunks > 0
                  ? `📄 I've received and fully processed **${file.name}** (${(file.size / 1024).toFixed(1)} KB). I've indexed **${pdfChunks} chunks** from this PDF — you can now ask me anything about its content!`
                  : `${fileInfo.icon} I've received **${file.name}** (${(file.size / 1024).toFixed(1)} KB). The file has been uploaded successfully!`,
                timestamp: new Date(),
              },
            ],
          },
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      url,
      publicId,
      fileName: file.name,
      fileType: fileInfo.ext,
      fileSize: file.size,
      icon: fileInfo.icon,
      pdfChunks: isPDF ? pdfChunks : undefined,
    });

  } catch (err: any) {
    console.error('[Upload Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}