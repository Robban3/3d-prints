from PIL import Image
from pathlib import Path
import json
mapping={"signe":"C:\\Users\\robvan\\.codex\\generated_images\\01a12555-e430-7eb3-b4a6-5a6728b17651\\exec-b4b30b9b-08a6-4496-acef-3fe76ad97261.png","julgran":"C:\\Users\\robvan\\.codex\\generated_images\\01a12555-e430-7eb3-b4a6-5a6728b17651\\exec-c3ff6b09-b8a6-4da4-a87e-0ffeda2f3fc3.png","stjarna":"C:\\Users\\robvan\\.codex\\generated_images\\01a12555-e430-7eb3-b4a6-5a6728b17651\\exec-c63ef480-3dfb-40bf-8b37-f9cefa05d793.png","elise":"C:\\Users\\robvan\\.codex\\generated_images\\01a12555-e430-7eb3-b4a6-5a6728b17651\\exec-1d70e12a-f69b-4016-b55f-e3f75cc5f78a.png","gifts":"C:\\Users\\robvan\\.codex\\generated_images\\01a12555-e430-7eb3-b4a6-5a6728b17651\\exec-13b16efc-4bf1-4656-9d4f-ba1a49441e09.png","wrapping":"C:\\Users\\robvan\\.codex\\generated_images\\01a12555-e430-7eb3-b4a6-5a6728b17651\\exec-a91536b7-bea9-442c-ade2-945e813d3491.png","printing":"C:\\Users\\robvan\\.codex\\generated_images\\01a12555-e430-7eb3-b4a6-5a6728b17651\\exec-d126b4db-94d8-4f0d-b977-7e36421977a0.png"}
out=Path('client/public/images/campaign')
out.mkdir(parents=True,exist_ok=True)
for name,src in mapping.items():
 im=Image.open(src).convert('RGB')
 im.save(out/(name+'.webp'),quality=90)
 print(name,im.size)
