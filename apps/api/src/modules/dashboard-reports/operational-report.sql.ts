import { Prisma } from '@webhost-billing/database';
import type { OperationalReportId } from '@webhost-billing/shared';

const utc = (value: Prisma.Sql) =>
  Prisma.sql`coalesce(to_char(${value} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'')`;
const sentence = (value: Prisma.Sql) =>
  Prisma.sql`upper(left(replace(${value}::text,'_',' '),1)) || lower(substr(replace(${value}::text,'_',' '),2))`;

/** Only fixed SQL identifiers and parameterized values enter these report queries. */
export function operationalReportSql(
  report: OperationalReportId,
  currency: string,
  start: Date,
  end: Date,
  now: Date,
): Prisma.Sql {
  switch (report) {
    case 'income':
      return Prisma.sql`
      WITH entries AS (
        SELECT p.id AS payment_id, CASE WHEN p.kind='CHARGE' THEN p.amount::numeric ELSE -p.amount::numeric END AS cash,
          ii.id AS line_id, ii.line_position,
          greatest(coalesce(ii.line_total,0),0)::numeric AS weight,
          (ii.line_total<0 OR ii.currency<>p.currency) AS invalid,
          oi.product_id::text AS product_id, oi.product_name_snapshot AS label,
          CASE oi.kind WHEN 'HOSTING' THEN 'Hosting' WHEN 'ADD_ON' THEN 'Add-on' WHEN 'DOMAIN' THEN 'Domain' ELSE 'Unattributed' END AS kind
        FROM payments p LEFT JOIN invoice_items ii ON ii.invoice_id=p.invoice_id
        LEFT JOIN order_items oi ON oi.id=ii.order_item_id
        WHERE p.status='SUCCEEDED' AND p.currency=${currency} AND p.verified_at>=${start} AND p.verified_at<${end}
      ), weights AS (
        SELECT *, sum(weight) OVER (PARTITION BY payment_id) AS gross,
          bool_or(coalesce(invalid,false)) OVER (PARTITION BY payment_id) AS bad,
          sum(weight) OVER (PARTITION BY payment_id ORDER BY line_position,line_id ROWS UNBOUNDED PRECEDING) AS cumulative,
          row_number() OVER (PARTITION BY payment_id ORDER BY line_position,line_id) AS position
        FROM entries
      ), allocated AS (
        SELECT CASE WHEN bad OR gross=0 THEN NULL ELSE product_id END AS product_id,
          CASE WHEN bad OR gross=0 THEN 'Unattributed product' ELSE coalesce(label,'Unattributed product') END AS label,
          CASE WHEN bad OR gross=0 THEN 'Unattributed' ELSE kind END AS kind,
          CASE WHEN bad OR gross=0 THEN CASE WHEN position=1 THEN cash ELSE 0 END
            ELSE trunc(cash*cumulative/gross)-trunc(cash*(cumulative-weight)/gross) END AS amount
        FROM weights
      ) SELECT coalesce(product_id,'unknown') || '|' || label || '|' || kind AS id,
        ARRAY[label,kind,sum(amount)::text] AS cells FROM allocated
        GROUP BY product_id,label,kind HAVING sum(amount)<>0`;
    case 'renewals':
      return Prisma.sql`
      SELECT i.id::text AS id, ARRAY[i.invoice_number,
        CASE WHEN EXISTS(SELECT 1 FROM domain_renewal_invoices d WHERE d.invoice_id=i.id) THEN 'Domain' ELSE 'Hosting and add-ons' END,
        ${utc(Prisma.sql`i.due_at`)}, i.total::text,i.amount_paid::text,i.credit_total::text,i.balance_due::text] AS cells
      FROM invoices i WHERE i.currency=${currency} AND i.status NOT IN ('DRAFT','CANCELLED')
        AND i.issued_at IS NOT NULL AND i.due_at>=${start} AND i.due_at<${end}
        AND (EXISTS(SELECT 1 FROM domain_renewal_invoices d WHERE d.invoice_id=i.id)
          OR (NOT EXISTS(SELECT 1 FROM service_upgrades u WHERE u.invoice_id=i.id)
            AND EXISTS(SELECT 1 FROM invoice_items x WHERE x.invoice_id=i.id AND x.service_id IS NOT NULL AND x.service_period_start IS NOT NULL)))`;
    case 'recurring':
      return Prisma.sql`
      WITH eligible AS (
        SELECT s.* FROM services s JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=c.user_id
        WHERE s.status IN ('ACTIVE','SUSPENDED') AND s.currency=${currency} AND s.billing_period<>'ONE_TIME'
          AND s.next_due_at>=${start} AND s.next_due_at<${end} AND c.deleted_at IS NULL AND u.deleted_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM hosting_cancellation_requests r WHERE r.service_id=s.id AND r.status IN ('OPEN','COMPLETED'))
          AND NOT EXISTS(SELECT 1 FROM service_upgrades r WHERE r.service_id=s.id AND r.status IN ('REQUESTED','SCHEDULED','APPLYING','REVIEW_REQUIRED'))
      ), entries AS (
        SELECT s.product_id::text AS product_id,s.product_name_snapshot AS label,'Hosting' AS kind,s.billing_period,s.recurring_amount::numeric AS amount FROM eligible s
        UNION ALL
        SELECT a.product_id::text,a.product_name_snapshot,'Add-on',a.billing_period,a.line_total::numeric
          FROM eligible s JOIN order_items base ON base.id=s.order_item_id JOIN order_items a ON a.order_id=base.order_id
          WHERE a.kind='ADD_ON' AND a.billing_period=s.billing_period AND a.currency=s.currency AND a.fulfilled_at IS NOT NULL
            AND (a.renewal_ends_at IS NULL OR a.renewal_ends_at>s.next_due_at)
      ) SELECT product_id || '|' || label || '|' || kind || '|' || billing_period::text AS id,
        ARRAY[label,kind,${sentence(Prisma.sql`billing_period`)},count(*)::text,sum(amount)::text] AS cells
        FROM entries GROUP BY product_id,label,kind,billing_period`;
    case 'plan-changes':
      return Prisma.sql`
      SELECT r.id::text AS id, ARRAY[coalesce(s.domain,'Service ' || s.id::text),
        CASE r.quote->>'change' WHEN 'UPGRADE' THEN 'Upgrade' WHEN 'DOWNGRADE' THEN 'Downgrade' ELSE 'Unknown' END,
        coalesce(r.quote->'current'->>'name','Unknown'),coalesce(r.quote->'target'->>'name','Unknown'),
        ${sentence(Prisma.sql`r.status`)},${utc(Prisma.sql`r.created_at`)},${utc(Prisma.sql`r.completed_at`)}] AS cells
      FROM service_upgrades r JOIN services s ON s.id=r.service_id WHERE r.created_at>=${start} AND r.created_at<${end}`;
    case 'domain-renewals':
      return Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (r.renewal_invoice_id) r.* FROM domain_renewal_operations r ORDER BY r.renewal_invoice_id,r.attempt DESC,r.id
      ) SELECT r.id::text AS id, ARRAY[coalesce(d.domain_name,'Unknown domain'),i.invoice_number,r.attempt::text,
        ${sentence(Prisma.sql`r.status`)},coalesce(r.code,'Not recorded'),CASE WHEN r.financial_review_required THEN 'Required' ELSE 'No hold recorded' END,
        ${utc(Prisma.sql`r.created_at`)}] AS cells
      FROM latest r JOIN domain_renewal_invoices ri ON ri.id=r.renewal_invoice_id JOIN invoices i ON i.id=ri.invoice_id
      LEFT JOIN domains d ON d.id=r.domain_id WHERE r.created_at>=${start} AND r.created_at<${end}
        AND (r.status IN ('REJECTED','NEEDS_RECONCILIATION','FAILED','UNKNOWN','REVIEW_REQUIRED','INCONSISTENT') OR r.financial_review_required)`;
    case 'support':
      return Prisma.sql`
      SELECT d.id::text AS id,ARRAY[d.name,count(t.id) FILTER (WHERE t.created_at>=${start} AND t.created_at<${end})::text,
        count(t.id) FILTER (WHERE t.status='OPEN')::text,
        count(t.id) FILTER (WHERE t.status NOT IN ('OPEN','CLOSED'))::text,
        count(t.id) FILTER (WHERE t.status='CLOSED')::text] AS cells
      FROM support_departments d LEFT JOIN tickets t ON t.department_id=d.id GROUP BY d.id,d.name`;
    case 'cancellations':
      return Prisma.sql`
      SELECT r.id::text AS id, ARRAY[coalesce(s.domain,'Service ' || s.id::text),'Hosting cancellation',s.product_name_snapshot,
        ${utc(Prisma.sql`r.effective_at`)},CASE WHEN r.effective_at>${now} THEN 'Scheduled' ELSE 'Review now' END] AS cells
      FROM hosting_cancellation_requests r JOIN services s ON s.id=r.service_id WHERE r.status='OPEN'
      UNION ALL
      SELECT a.id::text, ARRAY[coalesce(s.domain,'Service ' || s.id::text),'Add-on removal',a.product_name_snapshot,
        ${utc(Prisma.sql`a.renewal_ends_at`)},CASE WHEN a.renewal_ends_at>${now} THEN 'Scheduled' ELSE 'Acknowledgement due' END]
      FROM services s JOIN order_items base ON base.id=s.order_item_id JOIN order_items a ON a.order_id=base.order_id
      WHERE a.kind='ADD_ON' AND a.renewal_ends_at IS NOT NULL AND a.fulfilled_at IS NOT NULL
        AND a.billing_period=s.billing_period AND a.currency=s.currency
        AND NOT EXISTS(SELECT 1 FROM activity_logs l WHERE l.entity_id=s.id AND l.entity_type='SERVICE'
          AND l.action='HOSTING_ADD_ON_CANCELLATION_COMPLETED' AND l.metadata->>'orderItemId'=a.id::text
          AND l.created_at>=a.renewal_ends_at
          AND l.metadata->>'renewalEndsAt'=${utc(Prisma.sql`a.renewal_ends_at`)})`;
  }
}
