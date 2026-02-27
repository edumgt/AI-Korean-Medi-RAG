import os
import json
import boto3
from botocore.exceptions import ClientError

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass


AWS_REGION = os.getenv("AWS_REGION", "ap-northeast-2")
SECRET_NAME = os.getenv("OPENAI_SECRET_NAME", "prod/openai")


def get_secret_from_aws(secret_name: str) -> dict:
    client = boto3.client("secretsmanager", region_name=AWS_REGION)

    try:
        resp = client.get_secret_value(SecretId=secret_name)
    except ClientError as e:
        raise RuntimeError(f"Secrets Manager 조회 실패: {e}")

    secret_string = resp.get("SecretString")
    if not secret_string:
        raise RuntimeError("SecretString 값이 없습니다.")

    # secret을 JSON 문자열로 저장한 경우
    try:
        return json.loads(secret_string)
    except json.JSONDecodeError:
        # secret을 plain text 하나로 저장한 경우
        return {"OPENAI_API_KEY": secret_string}


def get_openai_api_key() -> str:
    # 1) 로컬 개발: .env 우선
    local_key = os.getenv("OPENAI_API_KEY")
    if local_key:
        return local_key

    # 2) 운영: AWS Secrets Manager
    secret = get_secret_from_aws(SECRET_NAME)
    api_key = secret.get("OPENAI_API_KEY")

    if not api_key:
        raise RuntimeError("Secrets Manager에 OPENAI_API_KEY가 없습니다.")

    return api_key


if __name__ == "__main__":
    key = get_openai_api_key()
    print("OPENAI_API_KEY loaded:", f"{key[:8]}..." if key else "None")