// FeedVideo (native)
// ---------------------------------------------------------------------------
// Native implementation of the feed video player — a thin re-export of
// react-native-video's <Video /> under the FeedVideo name.
//
// The web counterpart lives in FeedVideo.web.js (HTML5 <video> via
// react-native-web) because react-native-video has no web build. Metro picks
// the right file per platform from the single "../components/FeedVideo" import,
// so screens never import react-native-video directly and the app no longer
// crashes on platforms where that package can't load.
// ---------------------------------------------------------------------------

export { Video as FeedVideo } from "react-native-video";