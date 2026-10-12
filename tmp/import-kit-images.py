from PIL import Image
sources = [{"file":"mala-din-jul-kit","path":"C:\\Users\\robvan\\.codex\\generated_images\\01a12555-e430-7eb3-b4a6-5a6728b17651\\exec-aa1377c6-a987-4391-85a7-1d3726809af5.png"},{"file":"julpyssel-kit","path":"C:\\Users\\robvan\\.codex\\generated_images\\01a12555-e430-7eb3-b4a6-5a6728b17651\\exec-270e1685-4355-4482-93d0-0e3c75c8000f.png"},{"file":"julkula-med-namn-utan-artal","path":"C:\\Users\\robvan\\.codex\\generated_images\\01a12555-e430-7eb3-b4a6-5a6728b17651\\exec-87871e26-595f-4621-abc8-bb0126062a7d.png"}]
for item in sources:
    Image.open(item['path']).convert('RGB').save('client/public/images/christmas/'+item['file']+'.webp','WEBP',quality=90)

