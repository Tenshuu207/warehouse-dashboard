import os
from pathlib import Path
import subprocess  # nosec B404
import sys


def run_check(name: str, command: list[str]) -> int:
    print(f"--- Running {name} ---")
    print(" ".join(command))
    try:
        result = subprocess.run(  # nosec B603 - trusted internal command list
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            print(f"✅ {name} Passed!")
        else:
            print(f"❌ {name} Failed with errors:")
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                print(result.stderr)
        return result.returncode
    except Exception as e:
        print(f"⚠️ Could not run {name}: {e}")
        return 1


def existing_targets() -> list[str]:
    targets: list[str] = []
    if Path("harden.py").exists():
        targets.append("harden.py")
    if Path("ingest").exists():
        targets.append("ingest")
    if Path("tests").exists():
        targets.append("tests")
    return targets


def main() -> None:
    print("\n🚀 Starting System Hardening Audit...")
    print(f"Working Directory: {os.getcwd()}\n")

    targets = existing_targets()
    if not targets:
        print("⚠️ No Python targets found.")
        raise SystemExit(1)

    base_targets = [t for t in targets if t != "tests"]
    security_targets = [t for t in ["harden.py", "ingest"] if Path(t).exists()]

    format_code = run_check(
        "Black (Formatting)",
        [sys.executable, "-m", "black", "--check", *targets],
    )

    style_code = run_check(
        "Flake8 (Style/Logic)",
        [
            sys.executable,
            "-m",
            "flake8",
            "--count",
            "--select=E9,F63,F7,F82",
            "--show-source",
            *base_targets,
        ],
    )

    security_code = run_check(
        "Bandit (Security)",
        [sys.executable, "-m", "bandit", "-r", "-lll", *security_targets],
    )

    type_code = run_check(
        "Mypy (Type Safety)",
        [sys.executable, "-m", "mypy", "--ignore-missing-imports", *base_targets],
    )

    logic_code = 0
    if Path("tests").exists():
        logic_code = run_check(
            "Pytest (Math Verification)", [sys.executable, "-m", "pytest"]
        )
    else:
        print("⏭️  Skipping Pytest (No 'tests' folder found yet).")

    print("\n" + "=" * 40)
    if all(
        c == 0 for c in [format_code, style_code, security_code, type_code, logic_code]
    ):
        print("🎉  SYSTEM HARDENED: All checks passed!")
    else:
        print("⚠️  AUDIT FAILED: Review the errors above.")
    print("=" * 40 + "\n")


if __name__ == "__main__":
    main()
