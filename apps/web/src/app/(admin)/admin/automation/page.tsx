import type { Metadata } from 'next';
import { AutomationManager } from '../../../../components/automation/automation-manager';
export const metadata: Metadata = { title: 'Automation' };
export default function Page() {
  return <AutomationManager />;
}
