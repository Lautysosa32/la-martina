param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    
    [Parameter(Mandatory=$false)]
    [string]$PrinterName
)

if ([string]::IsNullOrWhiteSpace($PrinterName)) {
    Get-Content -Path $FilePath -Raw | Out-Printer
} else {
    Get-Content -Path $FilePath -Raw | Out-Printer -Name $PrinterName
}
