export interface RecipeSummary {
  bookFillName: string;
  bookName: string;
  productFillName: string;
  productName: string;
  role: string;
  quality: string;
  materials: { fillName: string; name: string; qty: number }[];
  soulCost: number;
}

// Hand-mirrored from game/src/systems/furnaceRecipe.ts. The agent-server does
// not import game code; it only advises the NPC. The game remains authoritative.
const RECIPES: RecipeSummary[] = [
  {"bookFillName":"whgzzs","bookName":"尾火棍制作书","productFillName":"whg","productName":"尾火棍","role":"悟空","quality":"优 秀","materials":[{"fillName":"wptm","name":"檀木","qty":20}],"soulCost":200},
  {"bookFillName":"jmczzs","bookName":"角木铲制作书","productFillName":"jmc","productName":"角木铲","role":"沙僧","quality":"优 秀","materials":[{"fillName":"wptm","name":"檀木","qty":10},{"fillName":"wpxt","name":"玄铁","qty":10}],"soulCost":200},
  {"bookFillName":"bspzzs","bookName":"壁水袍制作书","productFillName":"bsp","productName":"壁水袍","role":"唐僧","quality":"优 秀","materials":[{"fillName":"wpsc","name":"丝绸","qty":20}],"soulCost":200},
  {"bookFillName":"dtkzzs","bookName":"氐土铠制作书","productFillName":"dtk","productName":"氐土铠","role":"八戒","quality":"优 秀","materials":[{"fillName":"wpxt","name":"玄铁","qty":20}],"soulCost":200},
  {"bookFillName":"tfljzzs","bookName":"通风灵戒制作书","productFillName":"tflj","productName":"通风灵戒","role":"","quality":"优 秀","materials":[{"fillName":"wpsc","name":"丝绸","qty":20},{"fillName":"wpxt","name":"玄铁","qty":20}],"soulCost":200},
  {"bookFillName":"wtpzzs","bookName":"胃土耙制作书","productFillName":"wtp","productName":"胃土耙","role":"八戒","quality":"精 良","materials":[{"fillName":"wptm","name":"檀木","qty":20},{"fillName":"wpxt","name":"玄铁","qty":20}],"soulCost":400},
  {"bookFillName":"yhjzzs","bookName":"翼火甲制作书","productFillName":"yhj","productName":"翼火甲","role":"悟空","quality":"精 良","materials":[{"fillName":"wpsc","name":"丝绸","qty":20},{"fillName":"wpxt","name":"玄铁","qty":20}],"soulCost":400},
  {"bookFillName":"jmyzzs","bookName":"井木衣制作书","productFillName":"jmy","productName":"井木衣","role":"沙僧","quality":"精 良","materials":[{"fillName":"wpsc","name":"丝绸","qty":40}],"soulCost":400},
  {"bookFillName":"mgzhzzs","bookName":"马官指环制作书","productFillName":"mgzh","productName":"马官指环","role":"","quality":"精 良","materials":[{"fillName":"wptm","name":"檀木","qty":20},{"fillName":"wpxt","name":"玄铁","qty":40}],"soulCost":400},
  {"bookFillName":"hljhzzs","bookName":"红莲教皇制作书","productFillName":"hljh","productName":"红莲教皇","role":"唐僧","quality":"史 诗","materials":[{"fillName":"wpsc","name":"丝绸","qty":80}],"soulCost":800},
  {"bookFillName":"wsjgzzs","bookName":"顽石金刚制作书","productFillName":"wsjg","productName":"顽石金刚","role":"八戒","quality":"史 诗","materials":[{"fillName":"wpxt","name":"玄铁","qty":80}],"soulCost":800},
  {"bookFillName":"ydjgzzs","bookName":"银弹金弓制作书","productFillName":"ydjg","productName":"银弹金弓","role":"沙僧","quality":"史 诗","materials":[{"fillName":"wptm","name":"檀木","qty":40},{"fillName":"wpxt","name":"玄铁","qty":40}],"soulCost":800},
  {"bookFillName":"tdlzjzzs","bookName":"提多罗吒戒制作书","productFillName":"tdlzj","productName":"提多罗吒戒","role":"","quality":"史 诗","materials":[{"fillName":"wptm","name":"檀木","qty":40},{"fillName":"wpxt","name":"玄铁","qty":80}],"soulCost":800},
  {"bookFillName":"xleyzzs","bookName":"厄夜制作书","productFillName":"xley","productName":"厄夜","role":"悟空","quality":"邪 灵","materials":[{"fillName":"wpsc","name":"丝绸","qty":80},{"fillName":"wpxt","name":"玄铁","qty":80}],"soulCost":1600},
  {"bookFillName":"xlczzzs","bookName":"残昼制作书","productFillName":"xlcz","productName":"残昼","role":"唐僧","quality":"邪 灵","materials":[{"fillName":"wpsc","name":"丝绸","qty":160}],"soulCost":1600},
  {"bookFillName":"xlryzzs","bookName":"如狱制作书","productFillName":"xlry","productName":"如狱","role":"八戒","quality":"邪 灵","materials":[{"fillName":"wpxt","name":"玄铁","qty":160}],"soulCost":1600},
  {"bookFillName":"xlyjzzs","bookName":"犹绝制作书","productFillName":"xlyj","productName":"犹绝","role":"沙僧","quality":"邪 灵","materials":[{"fillName":"wpsc","name":"丝绸","qty":160}],"soulCost":1600},
  {"bookFillName":"xlthzzs","bookName":"天荒制作书","productFillName":"xlth","productName":"天荒","role":"悟空","quality":"邪 灵","materials":[{"fillName":"wptm","name":"檀木","qty":80},{"fillName":"wpxt","name":"玄铁","qty":80}],"soulCost":1600},
  {"bookFillName":"xltczzs","bookName":"天残制作书","productFillName":"xltc","productName":"天残","role":"唐僧","quality":"邪 灵","materials":[{"fillName":"wptm","name":"檀木","qty":160}],"soulCost":1600},
  {"bookFillName":"xltzzzs","bookName":"天罪制作书","productFillName":"xltz","productName":"天罪","role":"八戒","quality":"邪 灵","materials":[{"fillName":"wpxt","name":"玄铁","qty":160}],"soulCost":1600},
  {"bookFillName":"xltszzs","bookName":"天殇制作书","productFillName":"xlts","productName":"天殇","role":"沙僧","quality":"邪 灵","materials":[{"fillName":"wptm","name":"檀木","qty":80},{"fillName":"wpxt","name":"玄铁","qty":80}],"soulCost":1600},
  {"bookFillName":"llyzzs","bookName":"玲珑玉制作书","productFillName":"lly","productName":"玲珑玉","role":"","quality":"邪 灵","materials":[{"fillName":"yhs","name":"玉衡石","qty":3},{"fillName":"tss","name":"天枢石","qty":3}],"soulCost":1600},
  {"bookFillName":"ryjgbzzs","bookName":"如意金箍棒制作书","productFillName":"ryjgb","productName":"如意金箍棒","role":"悟空","quality":"传 说","materials":[{"fillName":"yhs","name":"玉衡石","qty":7},{"fillName":"wpxt","name":"玄铁","qty":999}],"soulCost":1600},
  {"bookFillName":"dszkzzs","bookName":"大圣战铠制作书","productFillName":"dszk","productName":"大圣战铠","role":"悟空","quality":"传 说","materials":[{"fillName":"tss","name":"天枢石","qty":7},{"fillName":"wpsc","name":"丝绸","qty":999}],"soulCost":1600},
  {"bookFillName":"lhzzzs","bookName":"轮回杖制作书","productFillName":"lhz","productName":"轮回杖","role":"唐僧","quality":"传 说","materials":[{"fillName":"yhs","name":"玉衡石","qty":7},{"fillName":"wpxt","name":"玄铁","qty":999}],"soulCost":1600},
  {"bookFillName":"jljszzs","bookName":"锦襕袈裟制作书","productFillName":"jljs","productName":"锦襕袈裟","role":"唐僧","quality":"传 说","materials":[{"fillName":"tss","name":"天枢石","qty":7},{"fillName":"wpsc","name":"丝绸","qty":999}],"soulCost":1600},
  {"bookFillName":"jcdpzzs","bookName":"九齿钉耙制作书","productFillName":"jcdp","productName":"九齿钉耙","role":"八戒","quality":"传 说","materials":[{"fillName":"yhs","name":"玉衡石","qty":7},{"fillName":"wpxt","name":"玄铁","qty":999}],"soulCost":1600},
  {"bookFillName":"tpzyzzs","bookName":"天蓬战衣制作书","productFillName":"tpzy","productName":"天蓬战衣","role":"八戒","quality":"传 说","materials":[{"fillName":"tss","name":"天枢石","qty":7},{"fillName":"wpsc","name":"丝绸","qty":999}],"soulCost":1600},
  {"bookFillName":"mdflczzs","bookName":"摩多分浪铲制作书","productFillName":"mdflc","productName":"摩多分浪铲","role":"沙僧","quality":"传 说","materials":[{"fillName":"yhs","name":"玉衡石","qty":7},{"fillName":"wpxt","name":"玄铁","qty":999}],"soulCost":1600},
  {"bookFillName":"mdyszzs","bookName":"摩多月衫制作书","productFillName":"mdys","productName":"摩多月衫","role":"沙僧","quality":"传 说","materials":[{"fillName":"tss","name":"天枢石","qty":7},{"fillName":"wpsc","name":"丝绸","qty":999}],"soulCost":1600},
  {"bookFillName":"qlgzzs","bookName":"虬龙棍制作书","productFillName":"qlg","productName":"虬龙棍","role":"悟空","quality":"魂 器","materials":[{"fillName":"yhs","name":"玉衡石","qty":3},{"fillName":"wpxt","name":"玄铁","qty":300}],"soulCost":1600},
  {"bookFillName":"qljzzs","bookName":"虬龙甲制作书","productFillName":"qlj","productName":"虬龙甲","role":"悟空","quality":"魂 器","materials":[{"fillName":"tss","name":"天枢石","qty":3},{"fillName":"wpsc","name":"丝绸","qty":300}],"soulCost":1600},
  {"bookFillName":"plzzzs","bookName":"蟠龙杖制作书","productFillName":"plz","productName":"蟠龙杖","role":"唐僧","quality":"魂 器","materials":[{"fillName":"yhs","name":"玉衡石","qty":3},{"fillName":"wpxt","name":"玄铁","qty":300}],"soulCost":1600},
  {"bookFillName":"plpzzs","bookName":"蟠龙袍制作书","productFillName":"plp","productName":"蟠龙袍","role":"唐僧","quality":"魂 器","materials":[{"fillName":"tss","name":"天枢石","qty":3},{"fillName":"wpsc","name":"丝绸","qty":300}],"soulCost":1600},
  {"bookFillName":"ylfzzs","bookName":"应龙斧制作书","productFillName":"ylf","productName":"应龙斧","role":"八戒","quality":"魂 器","materials":[{"fillName":"yhs","name":"玉衡石","qty":3},{"fillName":"wpxt","name":"玄铁","qty":300}],"soulCost":1600},
  {"bookFillName":"ylkzzs","bookName":"应龙铠制作书","productFillName":"ylk","productName":"应龙铠","role":"八戒","quality":"魂 器","materials":[{"fillName":"tss","name":"天枢石","qty":3},{"fillName":"wpsc","name":"丝绸","qty":300}],"soulCost":1600},
  {"bookFillName":"jljzzs","bookName":"蛟龙甲制作书","productFillName":"jlj","productName":"蛟龙甲","role":"沙僧","quality":"魂 器","materials":[{"fillName":"tss","name":"天枢石","qty":3},{"fillName":"wpsc","name":"丝绸","qty":300}],"soulCost":1600},
  {"bookFillName":"jlczzs","bookName":"蛟龙铲制作书","productFillName":"jlc","productName":"蛟龙铲","role":"沙僧","quality":"魂 器","materials":[{"fillName":"yhs","name":"玉衡石","qty":3},{"fillName":"wpxt","name":"玄铁","qty":300}],"soulCost":1600},
  {"bookFillName":"jlgzzs","bookName":"蛟龙弓制作书","productFillName":"jlg","productName":"蛟龙弓","role":"沙僧","quality":"魂 器","materials":[{"fillName":"yhs","name":"玉衡石","qty":3},{"fillName":"wpxt","name":"玄铁","qty":300}],"soulCost":1600},
];

function copyRecipe(recipe: RecipeSummary): RecipeSummary {
  return { ...recipe, materials: recipe.materials.map((material) => ({ ...material })) };
}

export function listRecipes(): RecipeSummary[] {
  return RECIPES.map(copyRecipe);
}

export function findRecipe(bookFillName: string): RecipeSummary | undefined {
  const recipe = RECIPES.find((entry) => entry.bookFillName === bookFillName);
  return recipe ? copyRecipe(recipe) : undefined;
}

export function checkMaterials(
  recipe: RecipeSummary,
  materials: { id: string; qty: number }[],
  soul: number,
): { ok: true } | { ok: false; missing: string[]; soulShort: boolean } {
  const owned = new Map<string, number>();
  for (const material of materials) {
    owned.set(material.id, (owned.get(material.id) ?? 0) + Math.max(0, Math.floor(material.qty)));
  }

  const missing = recipe.materials
    .map((material) => {
      const have = owned.get(material.fillName) ?? 0;
      const short = material.qty - have;
      return short > 0 ? `${material.name}(${material.fillName}) x${short}` : "";
    })
    .filter((entry) => entry.length > 0);
  const soulShort = soul < recipe.soulCost;
  return missing.length === 0 && !soulShort ? { ok: true } : { ok: false, missing, soulShort };
}
