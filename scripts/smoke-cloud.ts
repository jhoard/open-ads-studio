// M0 smoke test: proves this workspace can submit a workflow to Comfy Cloud,
// rebuild the job from its ID alone, and download the output.
// Usage: npx tsx scripts/smoke-cloud.ts [workflow] [inputImage] [inputNodeId] [outputDir]
import { config } from "dotenv";
import { Comfy, ComfyError } from "@comfyorg/sdk";
import { mkdir } from "node:fs/promises";
import path from "node:path";

config({ override: true, quiet: true });

const WAIT_TIMEOUT_MS = Number(process.env.GENERATION_WAIT_TIMEOUT_SECONDS ?? 660) * 1000;

const [workflowPath = "workflows/cutout.json", inputPath = "var/smoke/synthetic.png", inputNode = "1", outDir = "var/smoke"] =
  process.argv.slice(2);

async function main(): Promise<void> {
  const client = new Comfy();
  const wf = await client.workflows.fromFile(workflowPath);
  wf.setInput(inputNode, "image", client.assets.fromFile(inputPath));

  const submitted = await client.submit(wf);
  console.log(`submitted job ${submitted.id} (${submitted.status})`);

  // Rebuild from the ID alone, the same way an API route will after a page refresh.
  const job = await client.jobs.get(submitted.id);
  await job.wait(WAIT_TIMEOUT_MS);
  console.log(`terminal status: ${job.status}`);

  if (job.status !== "succeeded") {
    console.error("error_type:", JSON.stringify(job.error));
    process.exitCode = 1;
    return;
  }
  if (job.startedAt && job.completedAt) {
    console.log(`execution time: ${job.completedAt.getTime() - job.startedAt.getTime()}ms`);
  }

  await mkdir(outDir, { recursive: true });
  for (const [index, output] of job.outputs.entries()) {
    const ext = output.contentType.split("/")[1]?.split(";")[0] ?? "bin";
    const file = path.join(outDir, `${path.basename(workflowPath, ".json")}-${index}.${ext}`);
    await output.toFile(file);
    console.log(`saved ${output.type} (${output.contentType}) -> ${file}`);
  }
  console.log(`outputs expire at ${job.expiresAt.toISOString()}`);
}

main().catch((error: unknown) => {
  if (error instanceof ComfyError) {
    console.error(`${error.name} code=${String(error.code)} status=${String(error.status)}: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
