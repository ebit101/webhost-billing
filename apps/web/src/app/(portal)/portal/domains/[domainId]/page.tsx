import { ClientRecords } from '../../../../../components/customers/client-records';
export default async function Page({
  params,
}: {
  params: Promise<{ domainId: string }>;
}) {
  const { domainId } = await params;
  return (
    <ClientRecords kind="domains" recordId={domainId} administrator={false} />
  );
}
