#!/bin/sh
set -e

: "${CRON_SECRET:?CRON_SECRET is required}"
: "${LOU_BASE_URL:=http://127.0.0.1:3847/admin-lou}"

# Wrapper script that calls the Lou cron endpoints with auth
#
# `--max-time` : 120 s suffisaient tant que les tâches étaient courtes. La
# rédaction d'article demande cinq à six minutes de modèle, plus l'attente du
# visuel. Couper à 120 s ne l'aurait pas empêchée d'aboutir — Next ne s'arrête
# pas parce que le client raccroche — mais le journal aurait affiché un échec
# sur un article publié, ce qui est pire qu'un échec franc.
cat > /usr/local/bin/call-cron.sh << EOF
#!/bin/sh
ENDPOINT="\$1"
TS=\$(date '+%Y-%m-%d %H:%M:%S')
echo "[\$TS] -> \$ENDPOINT"
curl -sS --max-time 600 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${LOU_BASE_URL}/api/cron/\$ENDPOINT" \
  || echo "[\$TS] !! \$ENDPOINT failed"
EOF
chmod +x /usr/local/bin/call-cron.sh

# Install crontab
cp /crontab.template /etc/crontabs/root

echo "==> LOU cron started at $(date) — TZ=$TZ"
echo "==> Schedules:"
cat /etc/crontabs/root | grep -v '^#' | grep -v '^$'

# Run crond in foreground with logging to stderr
exec crond -f -d 8
