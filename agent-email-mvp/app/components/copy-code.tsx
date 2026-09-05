'use client';
import {useState} from 'react';
export function CopyButton({value,label='Copy'}:{value:string;label?:string}){const [message,setMessage]=useState('');return <><button type="button" className="secondary" aria-label={label} onClick={async()=>{try{await navigator.clipboard.writeText(value);setMessage('Copied');}catch{setMessage('Select the text to copy');}}}>{message||label}</button><span className="sr-only" role="status">{message}</span></>;}
export default function CopyCode({code,label}:{code:string;label:string}){return <div className="code-example"><div className="panel-header"><strong>{label}</strong><CopyButton value={code} label={'Copy '+label}/></div><pre className="code"><code>{code}</code></pre></div>;}
