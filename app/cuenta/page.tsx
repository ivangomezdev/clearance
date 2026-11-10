import type {Metadata} from 'next';
import {AuthForm} from '../../components/auth-form';
export const metadata: Metadata = {title: 'Mi cuenta · Clearance Radar'};
export default function AccountPage() {return <AuthForm mode="account"/>;}
