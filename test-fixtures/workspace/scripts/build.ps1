<#
.SYNOPSIS
    Builds the project

.DESCRIPTION
    PowerShell build script for the project
#>

param(
    [string]$Configuration = "Debug",
    [switch]$Clean
)

# @param Configuration Build configuration (default: Debug)
# @param Clean Whether to clean before building

Write-Host "Building in $Configuration mode..."
if ($Clean) {
    Write-Host "Cleaning first..."
}
