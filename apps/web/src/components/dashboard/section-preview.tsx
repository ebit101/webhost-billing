import { EmptyState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';

export function SectionPreview({
  area,
  title,
  description,
}: {
  area: 'Customer portal' | 'Administrator';
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-8">
      <PageHeader eyebrow={area} title={title} description={description} />
      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
        <div className="flex items-center gap-3">
          <StatusBadge tone="info">Layout preview</StatusBadge>
          <p className="text-sm text-brand-900">
            Fictional data only; workflows arrive in their authorized command.
          </p>
        </div>
      </div>
      <EmptyState
        title={`${title} will appear here`}
        description="This screen establishes responsive navigation, spacing, hierarchy, and reusable states without implementing the business module early."
      />
    </div>
  );
}
