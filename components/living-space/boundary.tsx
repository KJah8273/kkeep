'use client';
import {Component,type ReactNode} from 'react';
/** A decorative or lazy settings failure must not unmount a remote session. */
export default class LivingBoundary extends Component<{children:ReactNode;fallback:ReactNode;resetKey?:string},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidUpdate(previous:Readonly<{resetKey?:string}>){if(previous.resetKey!==this.props.resetKey&&this.state.failed)this.setState({failed:false});}
 render(){return this.state.failed?this.props.fallback:this.props.children;}
}
