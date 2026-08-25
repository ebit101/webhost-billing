DROP INDEX "hosting_panel_operations_retry_of_operation_id_idx";

CREATE UNIQUE INDEX "hosting_panel_operations_retry_of_operation_id_key"
ON "hosting_panel_operations"("retry_of_operation_id");
