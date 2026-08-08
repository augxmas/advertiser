#!/bin/bash
# ============================================================
# 광고 캠페인 상태 배치 crontab 등록 스크립트
# 매일 새벽 1시에 실행
#
# 사용법:
#   chmod +x setup-crontab.sh
#   ./setup-crontab.sh
# ============================================================

PROJECT_DIR=$(dirname "$(readlink -f "$0")")/..
TS_NODE=$(which ts-node 2>/dev/null || echo "$HOME/.npm-global/bin/ts-node")
LOG_FILE="/var/log/monorama-ad-batch.log"

CRON_JOB="0 1 * * * $TS_NODE $PROJECT_DIR/batch/campaign-status.ts >> $LOG_FILE 2>&1"

# 기존 등록된 동일 job 제거 후 재등록
( crontab -l 2>/dev/null | grep -v "campaign-status.ts" ; echo "$CRON_JOB" ) | crontab -

echo "✅ crontab 등록 완료:"
echo "   $CRON_JOB"
echo ""
echo "현재 crontab 목록:"
crontab -l
