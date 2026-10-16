import { notFound } from 'next/navigation';
import { isCommerceSandbox } from '@/lib/commerce-db';
export const dynamic='force-dynamic';
export const metadata={title:'PostDuty responsive preview',robots:{index:false,follow:false}};
export default async function ResponsivePreview({searchParams}:{searchParams:Promise<{screen?:string;width?:string}>}){
 if(!isCommerceSandbox())notFound();
 const params=await searchParams;
 const paths:Record<string,string>={christmas:'/christmas',store:'/store',owner:'/admin/products',creator:'/creator'};
 const screen=params.screen&&paths[params.screen]?params.screen:'christmas';
 const width=[360,390,768].includes(Number(params.width))?Number(params.width):390;
 return <main style={{background:'#e9e7df',padding:'20px 12px',minHeight:'100vh'}}><div style={{maxWidth:800,margin:'0 auto'}}><h1 style={{fontSize:18,marginBottom:12}}>Responsive QA · {width}px</h1><nav style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:16}}>{Object.keys(paths).map(key=><a key={key} href={`?screen=${key}&width=${width}`}>{key}</a>)}{[360,390,768].map(size=><a key={size} href={`?screen=${screen}&width=${size}`}>{size}px</a>)}</nav><iframe title={`${screen} mobile preview`} src={paths[screen]} width={width} height={844} style={{display:'block',width,maxWidth:'100%',height:844,border:'1px solid #b6bcb3',borderRadius:20,background:'white',margin:'auto'}}/></div></main>;
}
