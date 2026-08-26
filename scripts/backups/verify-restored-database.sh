#!/usr/bin/env bash

set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
source "$script_directory/common.sh"

[[ $# -eq 1 ]] || backup_die "Usage: $0 ISOLATED_DATABASE_NAME"
target_database=$1
backup_validate_recovery_database_name "$target_database"
backup_require_runtime
backup_database_exists "$target_database" || backup_die "The recovery database does not exist."

verification_result=$(
  backup_compose exec -T \
    -e RECOVERY_TARGET_DATABASE="$target_database" \
    "$BACKUP_POSTGRES_SERVICE" \
    sh -ceu '
      psql --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" \
        --no-align --tuples-only --field-separator "|" --set ON_ERROR_STOP=1 <<'\''SQL'\''
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = '\''public'\'' AND table_type = '\''BASE TABLE'\'') AS table_count,
  (SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS migration_count,
  (
    (SELECT COUNT(*) FROM customers c LEFT JOIN users u ON u.id = c.user_id WHERE u.id IS NULL) +
    (SELECT COUNT(*) FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL) +
    (SELECT COUNT(*) FROM invoice_items ii LEFT JOIN invoices i ON i.id = ii.invoice_id WHERE i.id IS NULL) +
    (SELECT COUNT(*) FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id WHERE i.id IS NULL) +
    (SELECT COUNT(*) FROM services s LEFT JOIN customers c ON c.id = s.customer_id WHERE c.id IS NULL) +
    (SELECT COUNT(*) FROM services s LEFT JOIN order_items oi ON oi.id = s.order_item_id WHERE oi.id IS NULL) +
    (SELECT COUNT(*) FROM ticket_messages tm LEFT JOIN tickets t ON t.id = tm.ticket_id WHERE t.id IS NULL) +
    (SELECT COUNT(*) FROM payment_events pe LEFT JOIN payments p ON p.id = pe.payment_id WHERE pe.payment_id IS NOT NULL AND p.id IS NULL)
  ) AS orphan_count,
  (
    (SELECT COUNT(*) FROM order_items WHERE line_total <> (unit_amount * quantity) + setup_fee) +
    (SELECT COUNT(*) FROM invoice_items WHERE line_total <> (unit_amount * quantity) - discount_amount + tax_amount) +
    (SELECT COUNT(*) FROM invoices WHERE total <> subtotal + tax_total - discount_total OR balance_due <> total - credit_total - amount_paid)
  ) AS financial_violation_count,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM customers) AS customers,
  (SELECT COUNT(*) FROM orders) AS orders,
  (SELECT COUNT(*) FROM invoices) AS invoices,
  (SELECT COUNT(*) FROM payments) AS payments,
  (SELECT COUNT(*) FROM services) AS services;
SQL
    '
)

IFS='|' read -r table_count migration_count orphan_count financial_violation_count users customers orders invoices payments services <<<"$verification_result"

((table_count >= 30)) || backup_die "The restored schema is missing application tables."
((migration_count >= 1)) || backup_die "The restored database has no completed migration history."
((orphan_count == 0)) || backup_die "The restored database contains orphaned critical relationships."
((financial_violation_count == 0)) || backup_die "The restored database violates financial invariants."

printf 'Restore verification: tables=%s migrations=%s users=%s customers=%s orders=%s invoices=%s payments=%s services=%s orphans=0 financial_violations=0\n' \
  "$table_count" "$migration_count" "$users" "$customers" "$orders" "$invoices" "$payments" "$services"
