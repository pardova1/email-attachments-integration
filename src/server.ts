import express from "express";
import { z } from "zod";
import { MemoryStorage } from "./adapters/memory-storage.js";
import { TransferService } from "./services/transfer-service.js";

const app = express();
const service = new TransferService(new MemoryStorage());

app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const createSchema = z.object({
  fileName: z.string().min(1).max(1024),
  contentType: z.string().min(1).max(255),
  totalBytes: z.number().int().positive(),
  chunkBytes: z.number().int().positive().optional()
});

app.post("/v1/transfers", (req, res) => {
  try {
    const input = createSchema.parse(req.body);
    const t = service.create(input);
    res.status(201).json({
      id: t.id,
      chunkBytes: t.chunkBytes,
      expiresAt: t.expiresAt,
      uploadPartUrlTemplate: `/v1/transfers/${t.id}/parts/{partNumber}`
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "INVALID_REQUEST" });
  }
});

app.put("/v1/transfers/:id/parts/:partNumber", express.raw({ type: "*/*", limit: "70mb" }), async (req, res) => {
  try {
    const result = await service.uploadPart(req.params.id, Number(req.params.partNumber), Buffer.from(req.body));
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "UPLOAD_FAILED" });
  }
});

app.get("/v1/transfers/:id", (req, res) => {
  try { res.json(service.status(req.params.id)); }
  catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : "NOT_FOUND" }); }
});

app.post("/v1/transfers/:id/complete", async (req, res) => {
  try { res.json(await service.complete(req.params.id)); }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "COMPLETE_FAILED" }); }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`email-attachments-integration listening on :${port}`));
