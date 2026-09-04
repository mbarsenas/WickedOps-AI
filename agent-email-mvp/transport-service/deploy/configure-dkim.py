from pathlib import Path

config_path = Path("/etc/opendkim.conf")
config = config_path.read_text(encoding="utf-8")
for directive in ("Domain", "Selector", "KeyFile", "KeyTable", "SigningTable", "InternalHosts", "ExternalIgnoreList", "Mode"):
    config = "\n".join(
        line for line in config.splitlines()
        if not line.lstrip().startswith(directive + "\t") and not line.lstrip().startswith(directive + " ")
    )
config += """

Mode                    sv
KeyTable                refile:/etc/opendkim/key.table
SigningTable            refile:/etc/opendkim/signing.table
InternalHosts           refile:/etc/opendkim/trusted.hosts
ExternalIgnoreList      refile:/etc/opendkim/trusted.hosts
"""
config_path.write_text(config, encoding="utf-8")
Path("/etc/opendkim/key.table").write_text(
    "senderpermit senderpermit.com:mail:/etc/opendkim/keys/senderpermit.com/mail.private\n",
    encoding="utf-8",
)
Path("/etc/opendkim/signing.table").write_text(
    "*@senderpermit.com senderpermit\n*@*.senderpermit.com senderpermit\n",
    encoding="utf-8",
)
Path("/etc/opendkim/trusted.hosts").write_text(
    "127.0.0.1\n::1\nlocalhost\nmail.senderpermit.com\n",
    encoding="utf-8",
)
