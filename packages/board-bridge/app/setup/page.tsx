export default function Help() {
  const miroAvailable = !!(process.env.MIRO_CLIENT_ID && process.env.MIRO_CLIENT_SECRET);
  return (
    <main className="setup-page">
      <a href="/">← Back to your workspace</a>
      <p className="eyebrow" style={{ marginTop: 40 }}>BOARD BRIDGE / HOW IT WORKS</p>
      <h1>Bring the board. Keep the ideas.</h1>
      <p>Preview your FigJam content, review what will transfer, and move supported objects into an editable Miro board.</p>

      <div className="notice">
        <strong>What you can try today</strong>
        <p>Load the sample board or upload an existing Board Bridge JSON export. Preview its layout, check compatibility, and download a portable copy.</p>
        <a href="/">Open the workspace →</a>
      </div>

      <h2>1. Bring your FigJam board</h2>
      <p>If you already have a Board Bridge JSON export, upload it in the workspace. Native .fig and .jam files are not supported in this version.</p>
      <p>The FigJam exporter is not available for standard installation yet. For now, use an existing export or try the sample board.</p>

      <h2>2. Connect Miro</h2>
      {miroAvailable ? <>
        <p>Choose Connect Miro, sign in, and approve access to the workspace you want to use. The app creates a new board for your migration. You can also choose an existing empty board.</p>
        <p><a className="button secondary" href="/api/auth/connect">Connect Miro ↗</a></p>
      </> : <p>Miro connections aren’t enabled in this build yet. There’s nothing for you to configure. You can preview your board and download its data while this connection is being prepared.</p>}

      <h2>3. Review and move</h2>
      <p>Check the preview and compatibility notes before starting. A new destination board is selected by default. The app transfers the objects, then checks their saved positions, images, and connector attachments. You can follow progress and download the report from the workspace.</p>

      <h2>Prefer a download?</h2>
      <p>Choose Save portable JSON after loading a board. You can upload that copy into Board Bridge later. It is a portable data export; Miro cannot open it as a native board backup.</p>

      <h2>What transfers</h2>
      <p>Supported shapes, sticky notes, text, embedded images, top-level sections, and attached connectors. The latest exporter preserves source line positions and bold text; paragraphs may become several editable text items. Unsupported fonts use a substitute, and sticky proportions may change. Freehand drawings, comments, and history are not preserved. Older exports may omit images or line spacing; the compatibility report identifies those gaps.</p>
    </main>
  );
}
