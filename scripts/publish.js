#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const tag = process.env.GITHUB_REF_NAME || '';
const version = tag.startsWith('v') ? tag : null;

if (!version) {
  throw new Error('GITHUB_REF_NAME must be a version tag like v1.0.0');
}

const productId = process.env.EDGE_PRODUCT_ID;
const clientId = process.env.EDGE_CLIENT_ID;
const clientSecret = process.env.EDGE_API_KEY;
const authUrl = process.env.EDGE_AUTH_URL || 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token';
const apiBaseUrl = (process.env.EDGE_API_BASE_URL || 'https://api.partner.microsoft.com/partnermanagement/v1.0').replace(/\/$/, '');
const buildDir = process.env.EDGE_BUILD_DIR || path.join(process.cwd(), 'dist', 'edge');
const zipPath = process.env.EDGE_PACKAGE_PATH || path.join(process.cwd(), 'dist', `edge-extension-${version}.zip`);

if (!productId || !clientId || !clientSecret) {
  throw new Error('EDGE_PRODUCT_ID, EDGE_CLIENT_ID, and EDGE_API_KEY secrets must be set.');
}

if (!fs.existsSync(buildDir)) {
  throw new Error(`Build directory not found: ${buildDir}`);
}

function logStep(step) {
  console.log(`::group::${step}`);
}

function endStep() {
  console.log('::endgroup::');
}

function packageExtension() {
  logStep('Packaging extension zip');
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }

  const pythonCode = `
import os, zipfile
root = os.path.normpath(r"${buildDir}")
out = os.path.normpath(r"${zipPath}")
exclude_dirs = {".git", "node_modules", ".github", "tests", "__tests__", "coverage"}

if not os.path.isdir(root):
    raise SystemExit(f"Build directory missing: {root}")

with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
        for filename in filenames:
            full_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(full_path, root)
            zf.write(full_path, arcname=rel_path)

print(out)
`;

  execFileSync('python3', ['-c', pythonCode], { stdio: 'inherit' });
  endStep();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let parsed;

  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (error) {
    parsed = { raw: text };
  }

  if (!response.ok) {
    const message = parsed.message || parsed.error || parsed.raw || `HTTP ${response.status}`;
    throw new Error(`API request failed (${response.status}) for ${url}: ${message}`);
  }

  return parsed;
}

async function publish() {
  packageExtension();

  if (!fs.existsSync(zipPath)) {
    throw new Error(`Package file missing after build: ${zipPath}`);
  }

  logStep('Requesting Microsoft authentication token');
  const tokenResponse = await fetchJson(authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://api.partner.microsoft.com/.default',
      grant_type: 'client_credentials'
    })
  });

  const accessToken = tokenResponse.access_token;
  if (!accessToken) {
    throw new Error('No access token returned from Azure AD');
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  const submissionEndpoint = `${apiBaseUrl}/products/${productId}/submissions`;
  logStep(`Creating Edge submission at ${submissionEndpoint}`);
  const submissionResponse = await fetchJson(submissionEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      productId,
      releaseNotes: `Release ${version}`
    })
  });

  const submissionId = submissionResponse.id || submissionResponse.submissionId || submissionResponse.submission?.id;
  if (!submissionId) {
    throw new Error(`Submission API response did not include submission ID: ${JSON.stringify(submissionResponse)}`);
  }

  const uploadEndpoint = `${apiBaseUrl}/products/${productId}/submissions/${submissionId}/packages`;
  logStep(`Uploading package to ${uploadEndpoint}`);

  const formData = new FormData();
  formData.append('package', fs.createReadStream(zipPath), path.basename(zipPath));

  const uploadResponse = await fetchJson(uploadEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: formData
  });

  const packageId = uploadResponse.id || uploadResponse.packageId || uploadResponse.package?.id;
  if (!packageId) {
    throw new Error(`Upload API response did not include package ID: ${JSON.stringify(uploadResponse)}`);
  }

  const publishEndpoint = `${apiBaseUrl}/products/${productId}/submissions/${submissionId}/publish`;
  logStep(`Submitting publish request to ${publishEndpoint}`);
  const publishResponse = await fetchJson(publishEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      packageId,
      version
    })
  });

  endStep();
  console.log(`Successfully published ${version} to Microsoft Edge Add-ons. Submission ID: ${submissionId}, package ID: ${packageId}`);
  console.log(JSON.stringify(publishResponse, null, 2));
}

publish().catch((error) => {
  console.error('Edge publish failed');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
