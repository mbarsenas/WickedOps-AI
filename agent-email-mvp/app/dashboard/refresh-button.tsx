'use client';
import {useRef,useState} from 'react';
export function RefreshButton({onRefresh,disabled=false,label='Refresh'}:{onRefresh:()=>Promise<unknown>;disabled?:boolean;label?:string}){
 const [pending,setPending]=useState(false);const running=useRef(false);
 return <button type="button" className="secondary refresh-button" disabled={disabled||pending} aria-busy={pending} onClick={async()=>{if(running.current)return;running.current=true;setPending(true);try{await onRefresh();}finally{running.current=false;setPending(false);}}}><span className={pending?'refresh-icon spinning':'refresh-icon'} aria-hidden="true">↻</span><span>{pending?'Refreshing…':label}</span></button>;
}
