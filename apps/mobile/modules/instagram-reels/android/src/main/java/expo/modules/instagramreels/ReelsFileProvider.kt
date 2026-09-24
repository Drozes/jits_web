package expo.modules.instagramreels

import androidx.core.content.FileProvider

/**
 * Its own provider, with its own authority, rather than reusing the one
 * `expo-sharing` or `expo-file-system` installs. Two reasons: those
 * authorities are another package's implementation detail and can change
 * under us, and a grant made here is scoped to the clip this module handed
 * over rather than widening an authority the rest of the app depends on.
 *
 * `androidx.core.content.FileProvider` is available without declaring a
 * dependency: `expo-modules-core` exposes `androidx.core:core-ktx` as an
 * `api` dependency, and `expo-module-gradle-plugin` puts
 * `expo-modules-core` on this module's compile classpath.
 */
class ReelsFileProvider : FileProvider()
