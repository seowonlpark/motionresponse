// styles/skeleton.js
// The diagnostic view. Not one of the four, but it exercises the module
// contract end to end so the contract is proven before the real styles land.

export default {
  id: 'skeleton',
  label: 'Specimen',
  caption: 'The tracked figure, drawn plainly.',

  defaults: {
    jointSize: 7,
    boneWidth: 2.5,
    sweepRays: 1,
    trace: 0.14,
    ink: '#0B0B0D',
    paper: '#F6F6F7',
    accent: '#7FA8C9',
    rose: '#C98FB0',
  },

  schema: [
    { key: 'jointSize', label: 'Joint', min: 2, max: 18, step: 1 },
    { key: 'boneWidth', label: 'Line', min: 0.5, max: 8, step: 0.5 },
    { key: 'trace', label: 'Trace', min: 0, max: 0.6, step: 0.02 },
    { key: 'sweepRays', label: 'Sweep rays', min: 0, max: 1, step: 1 },
  ],

  draw(ctx, sig, s, frame) {
    const { w, h } = frame;
    const px = (p) => [p.x * w, p.y * h];

    ctx.fillStyle = s.paper;
    ctx.globalAlpha = 1 - s.trace;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    const [ox, oy] = px(sig.origin);

    // Shoulder line, the frame of reference every signal is measured against.
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = s.boneWidth * 0.6;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    const r = sig.scale * w;
    ctx.moveTo(ox - r, oy - sig.tilt * (Math.PI / 4) * r);
    ctx.lineTo(ox + r, oy + sig.tilt * (Math.PI / 4) * r);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const L of sig.limbs) {
      const alpha = 0.25 + L.tip.v * 0.75;
      ctx.globalAlpha = alpha;

      ctx.strokeStyle = s.ink;
      ctx.lineWidth = s.boneWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(...px(L.root));
      ctx.lineTo(...px(L.hinge));
      ctx.lineTo(...px(L.tip));
      ctx.stroke();

      // sweep drawn as a ray from origin, so the signal is visible as geometry
      if (s.sweepRays) {
        const base = Math.atan2(sig.tilt * (Math.PI / 4), 1);
        const a = L.sweep + base;
        ctx.strokeStyle = s.rose;
        ctx.lineWidth = 1;
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a) * r * 2.2 * L.reach, oy + Math.sin(a) * r * 2.2 * L.reach);
        ctx.stroke();
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.ink;
      for (const p of [L.root, L.hinge]) {
        const [x, y] = px(p);
        ctx.beginPath();
        ctx.arc(x, y, s.jointSize * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // Tip scaled by fold, so a bent limb reads at a glance.
      const [tx, ty] = px(L.tip);
      ctx.fillStyle = s.rose;
      ctx.beginPath();
      ctx.arc(tx, ty, s.jointSize * (0.7 + L.fold * 0.9), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};
