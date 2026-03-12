{{/*
Expand the name of the chart.
*/}}
{{- define "openfoundry.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this
(by the DNS naming spec). If release name contains chart name it will be used
as a full name.
*/}}
{{- define "openfoundry.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "openfoundry.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "openfoundry.labels" -}}
helm.sh/chart: {{ include "openfoundry.chart" . }}
{{ include "openfoundry.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "openfoundry.selectorLabels" -}}
app.kubernetes.io/name: {{ include "openfoundry.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Service-specific labels (used for backend services in range loops)
*/}}
{{- define "openfoundry.serviceLabels" -}}
helm.sh/chart: {{ include "openfoundry.chart" .root }}
app.kubernetes.io/name: {{ .serviceName }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- if .root.Chart.AppVersion }}
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Service-specific selector labels
*/}}
{{- define "openfoundry.serviceSelectorLabels" -}}
app.kubernetes.io/name: {{ .serviceName }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end }}

{{/*
Container image for a service
*/}}
{{- define "openfoundry.image" -}}
{{- printf "%s/openfoundry/%s:%s" .root.Values.global.image.registry .serviceName .root.Values.global.image.tag }}
{{- end }}

{{/*
Database URL constructed from postgresql values
*/}}
{{- define "openfoundry.databaseUrl" -}}
{{- printf "postgresql://%s:%s@%s-postgresql:5432/%s" .Values.postgresql.auth.username .Values.postgresql.auth.password (include "openfoundry.fullname" .) .Values.postgresql.auth.database }}
{{- end }}

{{/*
Redis URL
*/}}
{{- define "openfoundry.redisUrl" -}}
{{- printf "redis://%s-redis-master:6379" (include "openfoundry.fullname" .) }}
{{- end }}
