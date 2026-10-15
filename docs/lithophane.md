# Foto till litofan

Public route: `/litofan`, linked as Foto till 3D in the menu.

Independent browser implementation: local PNG/JPEG/WebP decoding, bounded height field, flat or curved panel (30–360 degrees), frame, brightness/contrast/gamma, smoothing, mirror/invert and binary STL export in millimetres. Full cylinders wrap their mesh indices without an open seam. Preview uses WebGL; model generation and STL encoding run in a cancellable worker. Without WebGL the generated STL remains downloadable.

Images are limited to 12 MiB and 24 megapixels. Mesh sampling is bounded to 360 points per axis. The original image is never uploaded. Only clicking the print-order button uploads the generated STL through the existing customer-upload API. Its encoded image is covered by the existing customer-file retention policy. The order form receives the uploaded file, measured mesh volume, PLA, fine quality and 100% infill. The ordinary server quote and manual production review still apply.

Geometry tests check closed edges, consistent winding, dimensions, volume, curved/cylindrical topology, invalid settings and STL orientation. A separate order handoff test checks file and print settings. Browser checks cover photo selection, rendered preview, actual STL download and a 320px viewport without horizontal overflow. Actual physical print quality depends on filament, slicing and lighting and has not been verified by a test print.
