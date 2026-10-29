import type { Comfy } from "@comfyorg/sdk";
import path from "node:path";
import type { StageName } from "@/lib/types";

interface StageSpec {
  file: string;
  /** LoadImage node whose filename widget receives the uploaded asset. */
  imageNode: string;
}

const STAGES: Record<StageName, StageSpec> = {
  "vfx-ltx": { file: "vfx-ltx.json", imageNode: "98" },
};

type Workflow = Awaited<ReturnType<Comfy["workflows"]["fromFile"]>>;

export async function buildWorkflow(client: Comfy, stage: StageName, imagePath: string): Promise<Workflow> {
  const spec = STAGES[stage];
  const workflow = await client.workflows.fromFile(path.join(process.cwd(), "workflows", spec.file));
  workflow.setInput(spec.imageNode, "image", client.assets.fromFile(imagePath));
  return workflow;
}
