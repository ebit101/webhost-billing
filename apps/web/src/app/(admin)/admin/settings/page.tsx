import type { Metadata } from 'next';
import { SettingsManager } from '../../../../components/settings/settings-manager';

export const metadata: Metadata = { title: 'General settings' };

export default function Page() {
  return <SettingsManager />;
}
