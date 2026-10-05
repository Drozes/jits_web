/**
 * What the installed native binary can do for match-video uploads.
 *
 * Background upload (jits-n2im.9) needs a native transfer module, which an
 * OTA can never add. Until a build carrying it ships, an upload runs only
 * while ELO RATED is in the foreground, so the copy tells the athlete to
 * keep the app open (jits-n2im.1) and a backgrounding mid-upload raises a
 * local notice. The build that adds background upload flips this (by
 * detecting its native module, so an OTA on an older binary still reads
 * false) and both the copy and the notice follow it.
 */
export function isBackgroundUploadSupported(): boolean {
  return false;
}
