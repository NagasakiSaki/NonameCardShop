// Snap one shared SCREEN translation, not individual actors/world coordinates.
// World rounding at zoom 1.25/1.5/1.75 changes nearest-neighbour sampling phase
// and makes the baked high-resolution floor shimmer during camera movement.
export function alignCameraPixels(camera){
  const m=camera.matrix;
  const x=m.tx-camera.scrollX*m.a-camera.scrollY*m.c;
  const y=m.ty-camera.scrollX*m.b-camera.scrollY*m.d;
  m.tx+=Math.round(x)-x;
  m.ty+=Math.round(y)-y;
  // Phaser's Canvas batch uses Float32 temporary matrices. The last multiply
  // can reintroduce ±0.00001px at a texel boundary, visibly changing nearest
  // sampling. Round the final screen translation without flooring world x/y.
  camera.renderRoundPixels=true;
}
export function cameraFollowLerp(delta){return 1-Math.exp(-Math.max(0,delta)/84);}
