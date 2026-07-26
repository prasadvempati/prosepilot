FROM erikvl87/languagetool

# LanguageTool OSS runs on port 8010 by default
# This is the free version without premium rules
# Premium rules require a LanguageTool Premium subscription

EXPOSE 8010

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8010/ || exit 1
