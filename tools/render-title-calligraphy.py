import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import uniform_filter1d, grey_erosion

XINGKAI="/System/Library/AssetsV2/com_apple_MobileAsset_Font8/13b8ce423f920875b28b551f9406bf1014e0a656.asset/AssetData/Xingkai.ttc"
BAOLI="/System/Library/AssetsV2/com_apple_MobileAsset_Font8/70875a1270987c17cfd6f40cd3d755ec04d03b33.asset/AssetData/Baoli.ttc"
OUT="/Users/e0_7/projects/zmxy3-remake/game/tmp/art-keyart/title/"
TEXT="再续西游"

def render_mask(fontpath, idx, size, W, H, tracking=0.10):
    font=ImageFont.truetype(fontpath, size, index=idx)
    img=Image.new("L",(W,H),0); d=ImageDraw.Draw(img)
    advances=[]
    for ch in TEXT:
        bb=d.textbbox((0,0),ch,font=font); advances.append((bb[2]-bb[0], bb[3]-bb[1], bb))
    gap=int(size*tracking)
    total=sum(a[0] for a in advances)+gap*(len(TEXT)-1)
    x=(W-total)//2
    for ch,(gw,gh,bb) in zip(TEXT,advances):
        y=(H-gh)//2 - bb[1]
        d.text((x-bb[0],y),ch,fill=255,font=font)
        x+=gw+gap
    return np.array(img).astype(np.float32)/255.0

def feibai(alpha, seed=0, floor=0.72):
    """subtle, horizontally-streaked dry brush concentrated toward stroke edges."""
    h,w=alpha.shape
    rng=np.random.default_rng(seed)
    # coarse noise -> long streaks: build small then upsample
    small=rng.random((h//6, w//30)).astype(np.float32)
    ni=Image.fromarray((small*255).astype(np.uint8)).resize((w,h))
    arr=np.array(ni).astype(np.float32)/255.0
    arr=uniform_filter1d(arr,size=90,axis=1,mode='reflect')   # long horizontal streaks
    arr=(arr-arr.min())/(arr.max()-arr.min()+1e-6)
    streak=np.clip((arr-0.4)*2.2,0,1)                          # mostly 1, occasional dips
    streak=streak*(1-floor)+floor
    # concentrate feibai away from deep interior (edges show dry brush more)
    interior=grey_erosion(alpha,size=(13,13))
    edgeband=np.clip(alpha-interior,0,1)                       # ~1 near edges, 0 deep inside
    reduce=(1-streak)*(0.35+0.65*edgeband)                    # deep interior stays solid
    return alpha*(1-reduce)

def ink_rgba(alpha, color=(24,20,17)):
    h,w=alpha.shape
    a_img=Image.fromarray((alpha*255).astype(np.uint8))
    halo=np.array(a_img.filter(ImageFilter.GaussianBlur(5))).astype(np.float32)/255.0*0.30
    rgba=np.zeros((h,w,4),np.float32)
    rng=np.random.default_rng(7)
    tone=1-rng.random((h,w)).astype(np.float32)*0.08
    for i,c in enumerate(color): rgba[...,i]=c*tone
    a=np.clip(alpha+halo*(alpha>0.02),0,1)
    rgba[...,3]=a*255
    return Image.fromarray(rgba.astype(np.uint8),"RGBA")

def seal(size=150, char="梦"):
    s=Image.new("RGBA",(size,size),(0,0,0,0)); d=ImageDraw.Draw(s)
    d.rounded_rectangle((6,6,size-6,size-6),radius=14,fill=(176,42,36,235))
    try:
        f=ImageFont.truetype(BAOLI,int(size*0.56),index=0)
        bb=d.textbbox((0,0),char,font=f)
        d.text(((size-(bb[2]-bb[0]))//2-bb[0],(size-(bb[3]-bb[1]))//2-bb[1]),char,font=f,fill=(245,238,230,255))
    except Exception: pass
    return s

W,H=2400,760
# 1 Xingkai dark ink transparent
m=render_mask(XINGKAI,0,460,W,H,0.10); ink_rgba(feibai(m,3)).save(OUT+"title_xingkai_transparent.png")
# 2 Baoli dark ink transparent
m=render_mask(BAOLI,0,430,W,H,0.14); ink_rgba(feibai(m,11)).save(OUT+"title_baoli_transparent.png")
# 3 Xingkai light-ink on deep bg + red seal
panel=np.zeros((H,W,4),np.float32); base=(30,27,24)
rng=np.random.default_rng(5)
cloud=np.array(Image.fromarray((rng.random((H,W))*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(45))).astype(np.float32)/255.0
for i in range(3): panel[...,i]=base[i]+cloud*16
panel[...,3]=255
bgimg=Image.fromarray(np.clip(panel,0,255).astype(np.uint8),"RGBA")
m=render_mask(XINGKAI,0,460,W,H,0.10)
bgimg.alpha_composite(ink_rgba(feibai(m,3),color=(240,234,222)))
bgimg.alpha_composite(seal(150),(W//2+560,H//2+140))
bgimg.save(OUT+"title_xingkai_darkseal.png")

# ---- verification previews on 宣纸 light bg ----
def xuan(W,H):
    rng=np.random.default_rng(2)
    n=np.array(Image.fromarray((rng.random((H,W))*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(30))).astype(np.float32)/255.0
    p=np.zeros((H,W,3),np.float32); tint=(238,230,214)
    for i in range(3): p[...,i]=tint[i]-n*10
    return Image.fromarray(np.clip(p,0,255).astype(np.uint8),"RGB").convert("RGBA")
for name in ["title_xingkai_transparent","title_baoli_transparent"]:
    t=Image.open(OUT+name+".png"); bg=xuan(W,H); bg.alpha_composite(t)
    bg.convert("RGB").save(OUT+"_preview_"+name+"_on_xuan.png")
print("done")
