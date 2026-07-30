[CmdletBinding()]
param(
  [string]$EvidenceDirectory = "release-evidence/phase-4a-5c-local"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$releaseSqlRoot = Join-Path $projectRoot "supabase/release/phase_4a_5c"
$evidenceRoot = Join-Path $projectRoot $EvidenceDirectory

New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory)]
    [string]$Label,
    [Parameter(Mandatory)]
    [scriptblock]$Command
  )

  Write-Host "==> $Label"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Invoke-LocalSql {
  param(
    [Parameter(Mandatory)]
    [string]$RelativePath,
    [Parameter(Mandatory)]
    [string]$EvidenceName
  )

  $sqlPath = Join-Path $projectRoot $RelativePath
  $evidencePath = Join-Path $evidenceRoot $EvidenceName
  Write-Host "==> SQL $RelativePath"
  $dockerCommand = (
    'type "{0}" | docker exec -i supabase_db_sarierp ' +
    'psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres'
  ) -f $sqlPath
  & cmd.exe /d /s /c $dockerCommand 2>&1 |
    Tee-Object -FilePath $evidencePath
  if ($LASTEXITCODE -ne 0) {
    throw "$RelativePath failed with exit code $LASTEXITCODE"
  }
}

Push-Location $projectRoot
try {
  Invoke-CheckedCommand "Reset exacto a 20260728130000" {
    npx supabase db reset --local --version 20260728130000 --no-seed
  }

  Invoke-LocalSql `
    "supabase/release/phase_4a_5c/00_predeploy_gate.sql" `
    "00_predeploy_gate.log"
  Invoke-LocalSql `
    "supabase/release/phase_4a_5c/01_predeploy_counts.sql" `
    "01_predeploy_counts.log"

  Invoke-CheckedCommand "Aplicar migraciones 4A-5C" {
    npx supabase migration up --local
  }

  Invoke-LocalSql `
    "supabase/release/phase_4a_5c/02_postdeploy_gate.sql" `
    "02_postdeploy_gate.log"
  Invoke-LocalSql `
    "supabase/release/phase_4a_5c/03_postdeploy_counts.sql" `
    "03_postdeploy_counts.log"
  Invoke-LocalSql `
    "supabase/release/phase_4a_5c/04_security_gate.sql" `
    "04_security_gate.log"

  $phaseTests = @(
    "booking_canonical_foundation.sql",
    "booking_canonical_consumers.sql",
    "canonical_operational_events.sql",
    "shipment_foundation.sql",
    "booking_schedule_revisions.sql",
    "booking_cutoffs_and_readiness.sql"
  )
  foreach ($test in $phaseTests) {
    Invoke-LocalSql "supabase/tests/$test" "test_$test.log"
  }

  $diagnostics = @(
    "booking_source_classification.sql",
    "booking_field_conflicts.sql",
    "booking_post_foundation_validation.sql",
    "shipment_backfill_classification.sql",
    "shipment_relationship_consistency.sql",
    "shipment_status_comparison.sql",
    "shipment_post_foundation_validation.sql",
    "booking_schedule_revision_coverage.sql",
    "booking_replacement_consistency.sql",
    "booking_original_schedule_integrity.sql",
    "booking_rollover_post_validation.sql",
    "booking_cutoff_integrity.sql",
    "container_vgm_integrity.sql",
    "booking_readiness_consistency.sql",
    "pre_shipment_post_validation.sql"
  )
  foreach ($diagnostic in $diagnostics) {
    Invoke-LocalSql `
      "supabase/diagnostics/$diagnostic" `
      "diagnostic_$diagnostic.log"
  }

  Invoke-CheckedCommand "Lint SQL local" {
    npx supabase db lint --local --level warning
  }

  Get-FileHash `
    (Get-ChildItem -Path "supabase/migrations/20260729*.sql" |
      Where-Object {
        $_.BaseName -match "^202607291[2-7]0000_"
      }) `
    -Algorithm SHA256 |
    ForEach-Object {
      "{0} {1}" -f ([System.IO.Path]::GetFileName($_.Path)), $_.Hash
    } |
    Set-Content -Path (Join-Path $evidenceRoot "migration_hashes.txt")

  "LOCAL_REHEARSAL_OK $(Get-Date -Format o)" |
    Set-Content -Path (Join-Path $evidenceRoot "RESULT.txt")
  Write-Host "Release rehearsal local completado: $evidenceRoot"
}
finally {
  Pop-Location
}
