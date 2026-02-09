Currently, if I run offline, it doesn't load.
The screen just becomes black.
There are errors in the console:
```
Uncaught Error: Could not load studio_small_03_1k.hdr: Failed to fetch
    at Object.onError (chunk-WC5LGDCT.js?v=6868de28:1297:38)
    at chunk-WU2AXWQP.js?v=6868de28:23469:40
```
Link it tries to open: https://raw.githubusercontent.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/studio_small_03_1k.hdr

Commeting out <Environment preset="studio" /> in Viewport.tsx makes it load, but I guess something ends up different.