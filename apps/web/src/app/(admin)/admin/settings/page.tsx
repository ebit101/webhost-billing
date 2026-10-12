import type { Metadata } from 'next';
import { SettingsManager } from '../../../../components/settings/settings-manager';
import { SmtpSettingsPanel } from '../../../../components/settings/smtp-settings-panel';
export const metadata: Metadata = { title: 'Settings' };
export default function Page() {
  return (
    <>
      <SettingsManager />
      <div className="mt-6">
        <SmtpSettingsPanel />
      </div>
    </>
  );
}
