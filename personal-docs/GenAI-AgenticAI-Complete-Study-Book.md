---
icon: material/book-open-page-variant
---

# 📘 Generative AI & Agentic AI — Complete Study Book

## DVS Gen AI Program — Comprehensive Reference Guide

---

**Author:** Lingamurthy Pokathota  
**Program:** DVS Gen AI & Agentic AI Bootcamp (March–August 2026)  
**Purpose:** Complete study reference for print and revision

---

## 📋 Table of Contents

| Chapter | Topic |
|---------|-------|
| 1 | Introduction to AI, ML & Generative AI |
| 2 | AWS Cloud Foundations |
| 3 | Python Programming |
| 4 | Prompt Engineering |
| 5 | Retrieval Augmented Generation (RAG) |
| 6 | LangChain Framework |
| 7 | Graph Databases & Neo4j |
| 8 | LangGraph — Agentic Workflows |
| 9 | Model Context Protocol (MCP) |
| 10 | AWS Bedrock & AgentCore |
| 11 | Kubernetes & EKS (Sunday Sessions) |
| 12 | Final Project — Capstone |
| A | Daily Learning Logs |
| B | Interview Preparation Q&A |

---
---

# Chapter 1: Introduction to AI, ML & Generative AI

## 1.1 What is Artificial Intelligence & Machine Learning?

### Key Concepts

**Artificial Intelligence (AI)** is the simulation of human intelligence in machines. It encompasses any system that can perceive its environment and take actions to maximize success at some goal.

**Machine Learning (ML)** is a subset of AI where systems learn from data without being explicitly programmed. The system improves with experience.

### Types of Machine Learning

| Type | Description | Example |
|------|-------------|---------|
| **Supervised Learning** | Learns from labeled data (input-output pairs) | Spam detection, image classification |
| **Unsupervised Learning** | Finds patterns in unlabeled data | Customer segmentation, anomaly detection |
| **Reinforcement Learning** | Learns via rewards/penalties from environment | Game playing, robotics |
| **Semi-Supervised** | Uses mix of labeled and unlabeled data | Medical imaging with limited labels |

### AI vs ML vs DL vs GenAI Hierarchy

```
┌──────────────────────────────────────────────┐
│            Artificial Intelligence            │
│  ┌────────────────────────────────────────┐  │
│  │          Machine Learning              │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │        Deep Learning             │  │  │
│  │  │  ┌────────────────────────────┐  │  │  │
│  │  │  │     Generative AI          │  │  │  │
│  │  │  │  (LLMs, Diffusion Models)  │  │  │  │
│  │  │  └────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

## 1.2 Introduction to Generative AI

### What is Generative AI?

Generative AI refers to AI systems that can **create new content** — text, images, code, audio, video — rather than just analyzing or classifying existing data.

### Key Characteristics
- **Generates** novel outputs (not retrieval-based)
- **Learns patterns** from massive training datasets
- **Produces** human-quality content
- **Adapts** through prompting and fine-tuning

### Generative AI vs Traditional AI

| Aspect | Traditional AI | Generative AI |
|--------|---------------|---------------|
| **Purpose** | Classify, predict, detect | Create, generate, synthesize |
| **Output** | Labels, numbers, decisions | Text, images, code, audio |
| **Training** | Task-specific datasets | Massive diverse corpora |
| **Flexibility** | Fixed task | Multi-task via prompts |
| **Examples** | Spam filter, recommendation engine | ChatGPT, DALL-E, Midjourney |

### Timeline of Generative AI

| Year | Milestone |
|------|-----------|
| 2014 | GANs (Generative Adversarial Networks) introduced by Ian Goodfellow |
| 2017 | **Transformer Architecture** — "Attention Is All You Need" paper |
| 2018 | GPT-1 (117M parameters) by OpenAI |
| 2019 | GPT-2 (1.5B parameters) |
| 2020 | GPT-3 (175B parameters) |
| 2021 | DALL-E, Codex |
| 2022 | ChatGPT launched (Nov 30), Stable Diffusion |
| 2023 | GPT-4, Claude, Llama 2, Gemini |
| 2024 | Claude 3, GPT-4o, Llama 3, open-source explosion |
| 2025 | Agentic AI, MCP Protocol, Multi-modal models |
| 2026 | AgentCore, Production Agents at scale |

### The GenAI Landscape

```
┌─────────────────────────────────────────────────────────┐
│                   GenAI LANDSCAPE                        │
├──────────────┬──────────────┬───────────────────────────┤
│  Foundation  │  Frameworks  │      Applications         │
│   Models     │              │                           │
├──────────────┼──────────────┼───────────────────────────┤
│ OpenAI GPT   │ LangChain    │ Chatbots                  │
│ Anthropic    │ LangGraph    │ Code Generation           │
│ Google Gemini│ LlamaIndex   │ Content Creation          │
│ Meta Llama   │ Haystack     │ Data Analysis             │
│ AWS Bedrock  │ CrewAI       │ Document Processing       │
│ Cohere       │ AutoGen      │ Customer Support          │
│ Mistral      │ Semantic     │ Search & Retrieval        │
│ HuggingFace  │ Kernel       │ Autonomous Agents         │
└──────────────┴──────────────┴───────────────────────────┘
```

---

## 1.3 Introduction to Large Language Models (LLMs)

### What is an LLM?

A **Large Language Model** is a deep learning model trained on massive text corpora that can understand and generate human language. They are built on the **Transformer architecture**.

### Key Properties of LLMs

1. **Scale**: Billions of parameters (GPT-4 ~1.7T, Llama 3 ~405B)
2. **Pre-training**: Trained on internet-scale text data
3. **In-context learning**: Can perform tasks given examples in the prompt
4. **Emergent abilities**: Capabilities that appear only at scale

### The Transformer Architecture

```
┌─────────────────────────────────────────┐
│           TRANSFORMER MODEL             │
├───────────────────┬─────────────────────┤
│     ENCODER       │      DECODER        │
├───────────────────┼─────────────────────┤
│ Input Embedding   │ Output Embedding    │
│ Positional Enc.   │ Positional Enc.     │
│ Multi-Head        │ Masked Multi-Head   │
│   Self-Attention  │   Self-Attention    │
│ Feed Forward      │ Cross-Attention     │
│ Layer Norm        │ Feed Forward        │
│ (Nx layers)       │ Layer Norm          │
│                   │ (Nx layers)         │
│                   │ Linear + Softmax    │
└───────────────────┴─────────────────────┘
```

**Key Components:**
- **Self-Attention**: Allows each token to attend to all other tokens
- **Multi-Head Attention**: Parallel attention mechanisms for different aspects
- **Positional Encoding**: Captures word order information
- **Feed-Forward Networks**: Process attention outputs
- **Layer Normalization**: Stabilizes training

### Types of Transformer Models

| Type | Architecture | Use Case | Examples |
|------|-------------|----------|----------|
| **Encoder-only** | Encoder | Understanding, classification | BERT, RoBERTa |
| **Decoder-only** | Decoder | Text generation | GPT, Llama, Claude |
| **Encoder-Decoder** | Both | Translation, summarization | T5, BART |

---

## 1.4 Conversation History & Memory

### How LLMs Handle Conversations

LLMs are **stateless** — they don't inherently remember previous conversations. Context must be provided in each request.

### Conversation History Pattern

```python
messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is Python?"},
    {"role": "assistant", "content": "Python is a programming language..."},
    {"role": "user", "content": "What are its main uses?"}  # Follows up
]
```

### Memory Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Full History** | Send all messages | Short conversations |
| **Sliding Window** | Last N messages | Medium conversations |
| **Summarization** | Summarize older messages | Long conversations |
| **Vector Store** | Embed & retrieve relevant history | Multi-session memory |

---

## 1.5 Tokens & Pricing

### What are Tokens?

Tokens are the basic units of text that LLMs process. A token is roughly:
- ~4 characters in English
- ~¾ of a word
- 1 word ≈ 1.3 tokens

### Token Examples

| Text | Tokens |
|------|--------|
| "Hello" | 1 token |
| "artificial intelligence" | 2 tokens |
| "ChatGPT is amazing!" | 5 tokens |

### Pricing Model (as of 2026)

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| GPT-4o | $2.50 | $10.00 |
| GPT-4o-mini | $0.15 | $0.60 |
| Claude 3.5 Sonnet | $3.00 | $15.00 |
| Claude 3 Haiku | $0.25 | $1.25 |
| Llama 3 (self-hosted) | Infrastructure cost | Infrastructure cost |

---

## 1.6 Context Window

### What is a Context Window?

The **context window** is the maximum number of tokens an LLM can process in a single request (input + output combined).

### Context Window Sizes

| Model | Context Window |
|-------|---------------|
| GPT-4o | 128K tokens |
| Claude 3.5 | 200K tokens |
| Gemini 1.5 Pro | 1M tokens |
| Llama 3 (405B) | 128K tokens |

### Managing Context Window

- **Chunking**: Break large documents into smaller pieces
- **RAG**: Retrieve only relevant sections
- **Summarization**: Compress less important content
- **Sliding Window**: Drop oldest context

---

## 1.7 Prompt Engineering vs Context Engineering

### Prompt Engineering
Focuses on **how you ask** — crafting the instruction to get the best response.

### Context Engineering
Focuses on **what information you provide** — curating the right context for the LLM to work with.

| Aspect | Prompt Engineering | Context Engineering |
|--------|-------------------|-------------------|
| **Focus** | Instruction crafting | Information curation |
| **What** | How to ask | What to include |
| **Example** | "Summarize in 3 bullets" | Providing relevant docs |
| **Tools** | Few-shot, chain-of-thought | RAG, knowledge bases |

---

## 1.8 Model Behavior & Human Evaluation

### Model Behavior Characteristics
- **Temperature**: Controls randomness (0 = deterministic, 1 = creative)
- **Top-p (Nucleus Sampling)**: Controls diversity of token selection
- **Frequency Penalty**: Reduces repetition
- **Presence Penalty**: Encourages topic diversity

### Human Evaluation Criteria

| Criterion | Description |
|-----------|-------------|
| **Accuracy** | Is the response factually correct? |
| **Relevance** | Does it answer the question asked? |
| **Completeness** | Does it cover all aspects? |
| **Coherence** | Is it well-organized and logical? |
| **Harmlessness** | Is it safe and unbiased? |
| **Helpfulness** | Is it practically useful? |

---

### 📝 Chapter 1 Key Takeaways

1. GenAI creates content; Traditional AI classifies/predicts
2. LLMs are built on the Transformer architecture (2017)
3. Tokens are the currency of LLMs (~4 chars = 1 token)
4. Context window = max tokens per request
5. Prompt engineering = how you ask; Context engineering = what you provide
6. Temperature controls creativity vs determinism

---
---


# Chapter 2: AWS Cloud Foundations

## 2.1 AWS Account Setup

### Creating an AWS Account
1. Go to aws.amazon.com
2. Click "Create an AWS Account"
3. Provide email, password, account name
4. Add payment information (free tier available)
5. Verify phone number
6. Select support plan (Basic = Free)

### AWS Free Tier
- **12 months free**: EC2 t2.micro, S3 5GB, RDS db.t2.micro
- **Always free**: Lambda 1M requests/month, DynamoDB 25GB
- **Trials**: SageMaker, Bedrock (limited)

---

## 2.2 Identity & Access Management (IAM)

### What is IAM?

IAM is AWS's service for managing **who** (authentication) can do **what** (authorization) on **which resources**.

### IAM Architecture

```
┌──────────────────────────────────────────────────┐
│                  AWS ACCOUNT                       │
│                                                    │
│  ┌─────────┐   ┌─────────┐   ┌──────────────┐   │
│  │  Users  │   │ Groups  │   │    Roles     │   │
│  │         │   │         │   │              │   │
│  │ user-1  │──▶│ dev-grp │   │ lambda-role  │   │
│  │ user-2  │   │ admin   │   │ ec2-role     │   │
│  └─────────┘   └────┬────┘   └──────┬───────┘   │
│                      │               │            │
│                      ▼               ▼            │
│              ┌──────────────────────────┐        │
│              │       POLICIES           │        │
│              │  (JSON Permission Docs)  │        │
│              └──────────────────────────┘        │
└──────────────────────────────────────────────────┘
```

### Creating an IAM User (Without Console Access)

```
Steps:
1. AWS Console → IAM → Users → Create User
2. Enter username (e.g., "svc-genai-app")
3. Do NOT check "Provide console access"
4. Attach policies or add to group
5. Create Access Key for programmatic access
6. Download credentials (Access Key ID + Secret Access Key)
```

### IAM Policy Structure (JSON)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::my-bucket/*"
    }
  ]
}
```

### IAM Best Practices

| Practice | Description |
|----------|-------------|
| **Least Privilege** | Grant only required permissions |
| **Use Groups** | Assign policies to groups, not individual users |
| **Use Roles** | For services (Lambda, EC2), use roles not keys |
| **MFA** | Enable Multi-Factor Authentication |
| **Rotate Keys** | Regularly rotate access keys |
| **No Root Usage** | Never use root account for daily tasks |

### Working with Groups

Groups are collections of IAM users. Policies attached to a group apply to all members.

```
Example Groups:
├── developers     → S3, Lambda, DynamoDB access
├── data-engineers → S3, Glue, Athena, Redshift access  
├── admins         → AdministratorAccess (full)
└── read-only      → ViewOnlyAccess
```

### Working with Roles

Roles are identities that AWS services or external accounts can **assume** temporarily.

**Use Cases:**
- Lambda function accessing S3
- EC2 instance accessing DynamoDB
- Cross-account access
- Federated user access

### Configuring AWS CLI with Service Account

```bash
# Install AWS CLI
pip install awscli

# Configure credentials
aws configure
# Enter: Access Key ID
# Enter: Secret Access Key  
# Enter: Default region (us-west-2)
# Enter: Output format (json)

# Verify
aws sts get-caller-identity
```

---

## 2.3 Elastic Compute Cloud (EC2)

### What is EC2?

EC2 provides resizable compute capacity in the cloud — virtual servers you can launch in minutes.

### EC2 Architecture

```
┌────────────────────────────────────────────┐
│              AWS REGION (us-west-2)        │
│  ┌──────────────────────────────────────┐  │
│  │     Availability Zone (us-west-2a)   │  │
│  │                                      │  │
│  │  ┌────────────┐  ┌────────────┐     │  │
│  │  │ EC2 Instance│  │ EC2 Instance│    │  │
│  │  │ (t2.micro) │  │ (t3.medium)│     │  │
│  │  │            │  │            │     │  │
│  │  │ ┌──────┐   │  │ ┌──────┐  │     │  │
│  │  │ │ EBS  │   │  │ │ EBS  │  │     │  │
│  │  │ │Volume│   │  │ │Volume│  │     │  │
│  │  │ └──────┘   │  │ └──────┘  │     │  │
│  │  └────────────┘  └────────────┘     │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### Creating an EC2 Instance

```
Steps:
1. AWS Console → EC2 → Launch Instance
2. Name: "genai-dev-server"
3. AMI: Amazon Linux 2023 / Ubuntu 22.04
4. Instance Type: t2.micro (free tier)
5. Key Pair: Create new → Download .pem file
6. Security Group: Allow SSH (port 22)
7. Storage: 8 GB gp3 (default)
8. Launch Instance
```

### Connecting to EC2

```bash
# Linux/Mac
chmod 400 my-key.pem
ssh -i "my-key.pem" ec2-user@<public-ip>

# Windows (PowerShell)
ssh -i "my-key.pem" ec2-user@<public-ip>
```

### Common Instance Types

| Type | vCPU | Memory | Use Case |
|------|------|--------|----------|
| t2.micro | 1 | 1 GB | Free tier, testing |
| t3.medium | 2 | 4 GB | Small applications |
| m5.large | 2 | 8 GB | General purpose |
| c5.xlarge | 4 | 8 GB | Compute-intensive |
| g4dn.xlarge | 4 | 16 GB | ML inference (GPU) |

---

## 2.4 Simple Storage Service (S3)

### What is S3?

S3 is object storage with unlimited scalability. Store and retrieve any amount of data.

### S3 Concepts

| Concept | Description |
|---------|-------------|
| **Bucket** | Container for objects (globally unique name) |
| **Object** | File + metadata stored in a bucket |
| **Key** | Full path of the object within bucket |
| **Region** | Physical location of the bucket |

### Creating & Using S3

```bash
# Create bucket
aws s3 mb s3://my-genai-data-bucket

# Upload file
aws s3 cp local-file.csv s3://my-genai-data-bucket/data/

# Download file
aws s3 cp s3://my-genai-data-bucket/data/file.csv ./

# List objects
aws s3 ls s3://my-genai-data-bucket/

# Sync directory
aws s3 sync ./local-dir s3://my-genai-data-bucket/remote-dir/
```

### S3 Storage Classes

| Class | Use Case | Cost |
|-------|----------|------|
| Standard | Frequently accessed | $$$$ |
| Standard-IA | Infrequent access | $$$ |
| Glacier | Archive (minutes retrieval) | $$ |
| Glacier Deep Archive | Long-term archive (hours) | $ |

---

## 2.5 Relational Database Service (RDS)

### What is RDS?

Managed relational database service. AWS handles backups, patching, scaling.

### Supported Engines
- PostgreSQL
- MySQL
- MariaDB
- Oracle
- SQL Server
- Aurora (AWS-native)

### Creating an RDS Instance

```
Steps:
1. AWS Console → RDS → Create Database
2. Engine: PostgreSQL
3. Template: Free tier
4. DB Instance: db.t3.micro
5. Storage: 20 GB gp2
6. Master username/password
7. VPC & Security Group: Allow port 5432
8. Create Database
```

### Connecting to RDS

```python
import psycopg2

conn = psycopg2.connect(
    host="my-db.xxxxx.us-west-2.rds.amazonaws.com",
    port=5432,
    dbname="genaidb",
    user="admin",
    password="password123"
)
cursor = conn.cursor()
cursor.execute("SELECT * FROM users LIMIT 10;")
```

---

## 2.6 Docker & ECR (Elastic Container Registry)

### What is Docker?

Docker packages applications with their dependencies into **containers** — lightweight, portable, consistent environments.

### Docker Architecture

```
┌─────────────────────────────────┐
│         Docker Host             │
│  ┌───────────┐ ┌───────────┐   │
│  │ Container │ │ Container │   │
│  │  (App 1)  │ │  (App 2)  │   │
│  │ ┌───────┐ │ │ ┌───────┐ │   │
│  │ │ Python│ │ │ │ Node  │ │   │
│  │ │  3.11 │ │ │ │  18   │ │   │
│  │ └───────┘ │ │ └───────┘ │   │
│  └───────────┘ └───────────┘   │
│       Docker Engine             │
├─────────────────────────────────┤
│       Host Operating System     │
└─────────────────────────────────┘
```

### Dockerfile Example (Python GenAI App)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Docker Commands

```bash
# Build image
docker build -t genai-app:v1 .

# Run container
docker run -d -p 8000:8000 genai-app:v1

# List containers
docker ps

# View logs
docker logs <container-id>

# Stop container
docker stop <container-id>
```

### AWS ECR (Elastic Container Registry)

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region us-west-2 | \
  docker login --username AWS --password-stdin \
  123456789.dkr.ecr.us-west-2.amazonaws.com

# Create repository
aws ecr create-repository --repository-name genai-app

# Tag image
docker tag genai-app:v1 \
  123456789.dkr.ecr.us-west-2.amazonaws.com/genai-app:v1

# Push to ECR
docker push \
  123456789.dkr.ecr.us-west-2.amazonaws.com/genai-app:v1
```

---

## 2.7 AWS Lambda

### What is Lambda?

Serverless compute — run code without managing servers. Pay only for execution time.

### Lambda Architecture

```
┌─────────┐    ┌──────────┐    ┌──────────┐
│ Trigger │───▶│  Lambda  │───▶│  Output  │
│         │    │ Function │    │          │
├─────────┤    ├──────────┤    ├──────────┤
│ API GW  │    │ Python   │    │ DynamoDB │
│ S3 Event│    │ Node.js  │    │ S3       │
│ Schedule│    │ Java     │    │ SNS/SQS  │
│ SQS     │    │ Container│    │ API Resp │
└─────────┘    └──────────┘    └──────────┘
```

### Lambda Function Example (Python)

```python
import json
import boto3

def lambda_handler(event, context):
    """
    Lambda function for GenAI text processing
    """
    body = json.loads(event.get('body', '{}'))
    user_query = body.get('query', '')
    
    # Process with Bedrock
    bedrock = boto3.client('bedrock-runtime')
    response = bedrock.invoke_model(
        modelId='anthropic.claude-3-haiku-20240307-v1:0',
        body=json.dumps({
            "messages": [{"role": "user", "content": user_query}],
            "max_tokens": 1024
        })
    )
    
    result = json.loads(response['body'].read())
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'response': result['content'][0]['text']
        })
    }
```

### Lambda with Container Image

```
Steps:
1. Create Dockerfile with Lambda base image
2. Build & push to ECR
3. Create Lambda function → Container image
4. Select ECR image URI
5. Configure memory (up to 10GB) and timeout (up to 15min)
```

---

## 2.8 API Gateway

### What is API Gateway?

Fully managed service to create, publish, and manage REST/HTTP/WebSocket APIs.

### API Gateway + Lambda Architecture

```
┌──────────┐    ┌─────────────┐    ┌──────────┐    ┌──────────┐
│  Client  │───▶│ API Gateway │───▶│  Lambda  │───▶│ Database │
│ (Browser)│    │  /api/chat  │    │ Function │    │ DynamoDB │
│          │◀───│             │◀───│          │◀───│          │
└──────────┘    └─────────────┘    └──────────┘    └──────────┘
```

### Creating REST API

```
Steps:
1. API Gateway → Create API → REST API
2. Create Resource: /chat
3. Create Method: POST
4. Integration Type: Lambda Function
5. Deploy API → Create Stage (prod)
6. Get Invoke URL: https://xxx.execute-api.region.amazonaws.com/prod/chat
```

---

## 2.9 AWS Project: Lambda + DynamoDB

### Project Architecture

```
┌──────────┐    ┌─────────────┐    ┌──────────┐    ┌──────────┐
│  Client  │───▶│ API Gateway │───▶│  Lambda  │───▶│ DynamoDB │
│          │    │ REST API    │    │ (Python) │    │  Table   │
└──────────┘    └─────────────┘    └──────────┘    └──────────┘

Endpoints:
  POST /items     → Create item
  GET  /items     → List items
  GET  /items/{id}→ Get item
  PUT  /items/{id}→ Update item
  DELETE /items/{id}→ Delete item
```

---

### 📝 Chapter 2 Key Takeaways

1. IAM: Users, Groups, Roles, Policies — always follow least privilege
2. EC2: Virtual servers; use t2.micro for free tier
3. S3: Unlimited object storage; use for data and model artifacts
4. RDS: Managed relational databases (PostgreSQL recommended)
5. Docker: Package apps with dependencies; ECR for AWS registry
6. Lambda: Serverless compute; up to 15min execution, 10GB memory
7. API Gateway: Expose Lambda as REST APIs

---
---


# Chapter 3: Python Programming

## 3.1 Python Basics & Semantics

### Why Python for GenAI?
- Simple, readable syntax
- Rich ecosystem (LangChain, OpenAI SDK, boto3)
- Strong data science libraries (NumPy, Pandas)
- First-class support from all AI platforms

### Python Execution Model

```python
# Python is interpreted, dynamically typed
name = "GenAI"          # str - no type declaration needed
count = 42              # int
temperature = 0.7       # float
is_active = True        # bool
```

---

## 3.2 Variables & Data Types

### Basic Data Types

| Type | Example | Description |
|------|---------|-------------|
| `int` | `42` | Integer numbers |
| `float` | `3.14` | Decimal numbers |
| `str` | `"hello"` | Text strings |
| `bool` | `True/False` | Boolean values |
| `None` | `None` | Null/empty value |

### Type Conversion

```python
# String to int
num = int("42")        # 42

# Int to string
text = str(100)        # "100"

# String to float
price = float("9.99")  # 9.99

# Check type
type(num)              # <class 'int'>
isinstance(num, int)   # True
```

---

## 3.3 Operators

### Arithmetic Operators

```python
a + b    # Addition
a - b    # Subtraction
a * b    # Multiplication
a / b    # Division (float)
a // b   # Floor division (int)
a % b    # Modulus (remainder)
a ** b   # Exponentiation
```

### Comparison & Logical Operators

```python
# Comparison
a == b   # Equal
a != b   # Not equal
a > b    # Greater than
a >= b   # Greater than or equal

# Logical
x and y  # Both true
x or y   # Either true
not x    # Negate
```

---

## 3.4 Conditions (if/elif/else)

```python
temperature = 0.7

if temperature < 0.3:
    print("Low creativity - deterministic")
elif temperature < 0.7:
    print("Moderate creativity")
elif temperature <= 1.0:
    print("High creativity - diverse outputs")
else:
    print("Invalid temperature")

# Ternary operator
mode = "creative" if temperature > 0.5 else "precise"
```

---

## 3.5 Loops

### For Loop

```python
# Iterate over list
models = ["gpt-4", "claude-3", "gemini"]
for model in models:
    print(f"Model: {model}")

# Range
for i in range(5):
    print(i)  # 0, 1, 2, 3, 4

# Enumerate
for idx, model in enumerate(models):
    print(f"{idx}: {model}")
```

### While Loop

```python
retries = 3
while retries > 0:
    try:
        response = call_api()
        break
    except Exception:
        retries -= 1
        print(f"Retrying... {retries} left")
```

### List Comprehensions

```python
# Create list of token counts
texts = ["hello world", "generative ai", "python programming"]
token_counts = [len(t.split()) for t in texts]
# [2, 2, 2]

# Filter
long_texts = [t for t in texts if len(t) > 10]
```

---

## 3.6 Data Structures

### Lists (Ordered, Mutable)

```python
models = ["gpt-4", "claude", "gemini"]
models.append("llama")         # Add to end
models.insert(0, "mistral")   # Insert at index
models.remove("gemini")       # Remove by value
popped = models.pop()         # Remove & return last
models.sort()                 # Sort in place
```

### Tuples (Ordered, Immutable)

```python
# Use for fixed data
coordinates = (40.7128, -74.0060)
model_config = ("gpt-4", 0.7, 4096)

# Unpacking
name, temp, max_tokens = model_config
```

### Sets (Unordered, Unique)

```python
tags = {"ai", "ml", "genai", "ai"}  # {"ai", "ml", "genai"}
tags.add("llm")
tags.discard("ml")

# Set operations
set_a = {"python", "java", "go"}
set_b = {"python", "rust", "go"}
set_a & set_b   # Intersection: {"python", "go"}
set_a | set_b   # Union: {"python", "java", "go", "rust"}
set_a - set_b   # Difference: {"java"}
```

### Dictionaries (Key-Value Pairs)

```python
model_config = {
    "model": "gpt-4",
    "temperature": 0.7,
    "max_tokens": 4096,
    "top_p": 0.9
}

# Access
model_config["model"]          # "gpt-4"
model_config.get("stream", False)  # False (default)

# Update
model_config["temperature"] = 0.3

# Iterate
for key, value in model_config.items():
    print(f"{key}: {value}")

# Dictionary comprehension
token_map = {word: len(word) for word in ["hello", "world"]}
```

---

## 3.7 Functions

### Function Basics

```python
def generate_prompt(topic: str, style: str = "concise") -> str:
    """Generate a prompt for the given topic."""
    return f"Write a {style} explanation about {topic}."

# Call
prompt = generate_prompt("RAG", style="detailed")
```

### *args and **kwargs

```python
def call_llm(*messages, **config):
    """Flexible LLM call function."""
    print(f"Messages: {messages}")
    print(f"Config: {config}")

call_llm(
    "Hello", "How are you?",
    model="gpt-4", temperature=0.7
)
```

### Lambda Functions

```python
# Anonymous functions
square = lambda x: x ** 2
add = lambda a, b: a + b

# Common with map/filter
numbers = [1, 2, 3, 4, 5]
squared = list(map(lambda x: x**2, numbers))
evens = list(filter(lambda x: x % 2 == 0, numbers))
```

---

## 3.8 File Operations

```python
# Read file
with open("document.txt", "r") as f:
    content = f.read()

# Write file
with open("output.txt", "w") as f:
    f.write("Generated response")

# Read JSON
import json
with open("config.json", "r") as f:
    config = json.load(f)

# Write JSON
with open("result.json", "w") as f:
    json.dump({"response": "hello"}, f, indent=2)
```

---

## 3.9 Object-Oriented Programming (OOP)

### Classes & Objects

```python
class LLMClient:
    """Client for interacting with LLM APIs."""
    
    def __init__(self, model: str, temperature: float = 0.7):
        self.model = model
        self.temperature = temperature
        self.history = []
    
    def chat(self, message: str) -> str:
        """Send a message and get response."""
        self.history.append({"role": "user", "content": message})
        response = self._call_api(message)
        self.history.append({"role": "assistant", "content": response})
        return response
    
    def _call_api(self, message: str) -> str:
        """Private method to call the API."""
        # Implementation here
        return f"Response from {self.model}"

# Usage
client = LLMClient("gpt-4", temperature=0.3)
response = client.chat("What is GenAI?")
```

### Inheritance

```python
class BaseAgent:
    def __init__(self, name: str):
        self.name = name
    
    def act(self, input_data: str) -> str:
        raise NotImplementedError

class RAGAgent(BaseAgent):
    def __init__(self, name: str, vector_store):
        super().__init__(name)
        self.vector_store = vector_store
    
    def act(self, query: str) -> str:
        context = self.vector_store.search(query)
        return self._generate(query, context)
```

### Polymorphism

```python
class OpenAIProvider:
    def generate(self, prompt): 
        return "OpenAI response"

class AnthropicProvider:
    def generate(self, prompt): 
        return "Anthropic response"

# Same interface, different implementations
def get_response(provider, prompt):
    return provider.generate(prompt)

# Works with any provider
get_response(OpenAIProvider(), "Hello")
get_response(AnthropicProvider(), "Hello")
```

### Encapsulation & Abstraction

```python
from abc import ABC, abstractmethod

class BaseLLM(ABC):
    """Abstract base class for LLM providers."""
    
    @abstractmethod
    def invoke(self, prompt: str) -> str:
        """Must be implemented by subclasses."""
        pass
    
    @abstractmethod
    def get_token_count(self, text: str) -> int:
        pass
```

---

## 3.10 Exception Handling

```python
import time

def call_llm_with_retry(prompt: str, max_retries: int = 3) -> str:
    """Call LLM with exponential backoff retry."""
    for attempt in range(max_retries):
        try:
            response = llm.invoke(prompt)
            return response
        except RateLimitError:
            wait = 2 ** attempt
            print(f"Rate limited. Waiting {wait}s...")
            time.sleep(wait)
        except TimeoutError:
            print("Request timed out, retrying...")
        except Exception as e:
            print(f"Unexpected error: {e}")
            raise
    raise Exception(f"Failed after {max_retries} retries")
```

### Custom Exceptions

```python
class TokenLimitExceeded(Exception):
    """Raised when input exceeds model's context window."""
    def __init__(self, token_count: int, max_tokens: int):
        self.token_count = token_count
        self.max_tokens = max_tokens
        super().__init__(
            f"Token count {token_count} exceeds limit {max_tokens}"
        )
```

---

## 3.11 Pydantic — Data Validation

```python
from pydantic import BaseModel, Field
from typing import Optional, List

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(system|user|assistant)$")
    content: str = Field(..., min_length=1)

class ChatRequest(BaseModel):
    model: str = "gpt-4"
    messages: List[ChatMessage]
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=None, le=4096)

# Validation happens automatically
request = ChatRequest(
    messages=[ChatMessage(role="user", content="Hello")],
    temperature=0.9
)
```

---

## 3.12 Logging

```python
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def process_request(query: str):
    logger.info(f"Processing query: {query[:50]}...")
    try:
        result = llm.invoke(query)
        logger.info(f"Response generated: {len(result)} chars")
        return result
    except Exception as e:
        logger.error(f"Failed to process: {e}", exc_info=True)
        raise
```

---

### 📝 Chapter 3 Key Takeaways

1. Python is dynamically typed — use type hints for clarity
2. Lists are mutable, tuples are immutable, dicts are key-value
3. Functions support default args, *args, **kwargs
4. OOP: Classes, Inheritance, Polymorphism, Abstraction
5. Always use try/except with retry logic for API calls
6. Pydantic validates data at runtime — essential for API inputs
7. Use logging (not print) in production code

---
---


# Chapter 4: Prompt Engineering

## 4.1 LLM Architecture & Byte Pair Encoding (BPE)

### Architecture Diagrams Reference
> 📊 **Drawio Diagrams (MODULE4/1.LLM-ARCH-BPE):**
> - WHAT-IS-LLM
> - LLM-PROBLEMS
> - LLM-ENTERPRISE-ARCH
> - HOW-LLM-WORKS
> - BITE-PAIR-ENCODING

### How LLMs Work Internally

```
Input Text → Tokenization → Embedding → Transformer Layers → Output Probabilities → Generated Token
     ↓            ↓              ↓              ↓                      ↓
  "Hello"    [15496]      [0.2, -0.1,...]   Self-Attention      P("world")=0.3
                                             Feed-Forward        P("there")=0.2
                                             Layer Norm          P(",")=0.15
```

### Byte Pair Encoding (BPE)

BPE is the tokenization algorithm used by most LLMs (GPT, Claude, etc.).

**How BPE Works:**
1. Start with individual characters as tokens
2. Find most frequent adjacent pair
3. Merge that pair into a new token
4. Repeat until vocabulary size is reached

```
Example:
  "low lower lowest" 
  Step 1: Characters: l, o, w, e, r, s, t, (space)
  Step 2: Most frequent pair: "l" + "o" → "lo"
  Step 3: Most frequent pair: "lo" + "w" → "low"
  Step 4: Continue until vocab size reached...
  
  Final tokens: "low", "er", "est", " "
```

### LLM Enterprise Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTERPRISE LLM ARCHITECTURE               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐   ┌─────────────┐   ┌────────────────────┐  │
│  │   User   │──▶│  API Layer  │──▶│  Orchestration     │  │
│  │Interface │   │  (Gateway)  │   │  (LangChain/Graph) │  │
│  └──────────┘   └─────────────┘   └─────────┬──────────┘  │
│                                               │              │
│                    ┌──────────────────────────┼────────┐    │
│                    │                          ▼        │    │
│                    │  ┌────────────┐  ┌────────────┐  │    │
│                    │  │  Vector DB │  │    LLM     │  │    │
│                    │  │ (Pinecone) │  │ (Bedrock)  │  │    │
│                    │  └────────────┘  └────────────┘  │    │
│                    │        AI/ML Layer                │    │
│                    └──────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Data Layer (S3, RDS, DynamoDB)          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 4.2 What is Prompt Engineering?

### Architecture Diagrams Reference
> 📊 **Drawio Diagrams (MODULE4/PROMPT-ENGG):**
> - PROMPT-ENGG-PROMPT-ENGG
> - DIFF-TYPES-OF-PROMPTING
> - PRACTICLE-EXAMPLE
> - ITERATIVE-PROMPT-DEV
> - SUMMARIZATION
> - INFERRING
> - TRANSFORMATION
> - EXPANDING
> - MODEL-PARAMETERS
> - PROJECT-SERVICES
> - PROJECT-ARCHITECTURE

### Definition

Prompt Engineering is the art and science of crafting inputs (prompts) to LLMs to get desired, accurate, and useful outputs.

### Types of Prompting

| Type | Description | Example |
|------|-------------|---------|
| **Zero-shot** | No examples, just instruction | "Translate to French: Hello" |
| **One-shot** | One example provided | "happy→glad. sad→?" |
| **Few-shot** | Multiple examples | 3-5 examples before the task |
| **Chain-of-Thought** | Step-by-step reasoning | "Think step by step..." |
| **Self-Consistency** | Multiple reasoning paths | Generate 5 answers, pick majority |
| **Tree-of-Thought** | Explore multiple branches | Evaluate each reasoning branch |

### Prompt Structure (Best Practice)

```
┌─────────────────────────────────┐
│ SYSTEM PROMPT                   │
│ (Role, context, constraints)    │
├─────────────────────────────────┤
│ CONTEXT                         │
│ (Relevant information/docs)     │
├─────────────────────────────────┤
│ EXAMPLES (Few-shot)             │
│ (Input → Output pairs)          │
├─────────────────────────────────┤
│ USER INSTRUCTION                │
│ (The actual task/question)      │
├─────────────────────────────────┤
│ OUTPUT FORMAT                   │
│ (How to structure the response) │
└─────────────────────────────────┘
```

---

## 4.3 Prompting Techniques in Detail

### Zero-Shot Prompting

```python
prompt = """
Classify the following text as positive, negative, or neutral.

Text: "The new update makes the app much faster!"
Sentiment:
"""
# Output: positive
```

### Few-Shot Prompting

```python
prompt = """
Classify customer feedback:

Feedback: "Love the quick delivery!" → Positive
Feedback: "Product broke after 2 days" → Negative  
Feedback: "It arrived on time" → Neutral

Feedback: "Best purchase I've ever made!"
Classification:
"""
# Output: Positive
```

### Chain-of-Thought (CoT) Prompting

```python
prompt = """
Solve this step by step:

Q: A store has 4 boxes. Each box has 3 bags. Each bag has 5 apples.
How many apples total?

Let's think step by step:
1. Number of boxes: 4
2. Bags per box: 3
3. Total bags: 4 × 3 = 12
4. Apples per bag: 5
5. Total apples: 12 × 5 = 60

Answer: 60 apples
"""
```

### Iterative Prompt Development

```
Step 1: Write initial prompt → Test → Analyze output
Step 2: Identify issues (too long, wrong format, missing info)
Step 3: Refine prompt (add constraints, examples, format spec)
Step 4: Test again → Repeat until satisfied
```

---

## 4.4 Advanced Techniques

### Summarization Prompts

```python
prompt = """
Summarize the following article in exactly 3 bullet points.
Each bullet should be one sentence, max 20 words.
Focus on key facts, not opinions.

Article: {article_text}

Summary:
"""
```

### Inferring (Extraction & Analysis)

```python
prompt = """
Extract the following from the customer review:
- Sentiment (positive/negative/neutral)
- Product mentioned
- Key complaint or praise

Review: "The wireless headphones have amazing sound quality 
but the battery only lasts 2 hours which is disappointing."

Output (JSON):
"""
```

### Transformation Prompts

```python
prompt = """
Transform the following informal email into a professional 
business communication. Maintain the core message but use 
formal language and proper structure.

Informal: "Hey, the project's gonna be late cuz the team 
is swamped. Can we push the deadline?"

Professional:
"""
```

---

## 4.5 Model Parameters

| Parameter | Range | Effect |
|-----------|-------|--------|
| **Temperature** | 0.0 - 2.0 | Controls randomness. 0=deterministic, 1+=creative |
| **Top-p** | 0.0 - 1.0 | Nucleus sampling. 0.1=only top 10% probable tokens |
| **Top-k** | 1 - 100 | Consider only top-k tokens |
| **Max Tokens** | 1 - model limit | Maximum output length |
| **Frequency Penalty** | -2.0 - 2.0 | Penalize repeated tokens |
| **Presence Penalty** | -2.0 - 2.0 | Penalize tokens already in text |
| **Stop Sequences** | strings | Stop generation at these strings |

### When to Use What

| Use Case | Temperature | Top-p |
|----------|-------------|-------|
| Code generation | 0.0 - 0.2 | 0.1 |
| Factual Q&A | 0.0 - 0.3 | 0.2 |
| Business writing | 0.3 - 0.5 | 0.5 |
| Creative writing | 0.7 - 1.0 | 0.9 |
| Brainstorming | 0.8 - 1.2 | 0.95 |

---

## 4.6 Prompt Engineering Project: Text-to-SQL Chatbot

### Project Architecture
> 📊 **Drawio Diagrams:** PROJECT-SERVICES, PROJECT-ARCHITECTURE

```
┌──────────┐    ┌──────────────┐    ┌─────────┐    ┌──────────┐
│   User   │───▶│  Chat Agent  │───▶│   LLM   │───▶│PostgreSQL│
│  Query   │    │ (LangChain)  │    │(OpenAI) │    │ Database │
│"Show top │    │              │◀───│         │    │          │
│customers"│    │  ┌────────┐  │    └─────────┘    └──────────┘
└──────────┘    │  │SQL Gen │  │         ▲                │
                │  │Prompt  │  │         │                │
                │  └────────┘  │    Schema Info           │
                └──────────────┘                    Query Results
```

### Key Components
1. **Generic Query Executor** — Safely runs generated SQL
2. **LLM Text-SQL Agent** — Converts natural language to SQL
3. **Chat Assistant** — Conversational UI layer

---

### 📝 Chapter 4 Key Takeaways

1. BPE is how text gets tokenized into subword units
2. Prompt structure: System → Context → Examples → Instruction → Format
3. Zero-shot for simple tasks, few-shot for complex patterns
4. Chain-of-Thought forces step-by-step reasoning
5. Temperature 0 for facts, 0.7+ for creativity
6. Always iterate: write → test → analyze → refine

---
---


# Chapter 5: Retrieval Augmented Generation (RAG)

## 5.1 The Problem RAG Solves

### Architecture Diagrams Reference
> 📊 **Drawio Diagrams (MODULE5/RAG):**
> - RAG-PROBLEM
> - RAG (full architecture)
> - TRADITIONAL-DB-VS-VECTOR-DB
> - INGESTION pipeline
> - RETRIEVAL process
> - AUGMENTED-GENERATION
> - RAG-FINAL-ARCHITECTURE
> - FILE-TO-VECTORDB-CALC

### Why RAG?

LLMs have fundamental limitations:
- **Knowledge cutoff** — Training data has a date limit
- **Hallucinations** — May generate plausible but false information
- **No private data** — Cannot access company-specific documents
- **No real-time data** — Cannot access current information

### RAG Solution

RAG combines LLM generation with **retrieval from external knowledge bases**, grounding responses in actual data.

```
┌─────────────────────────────────────────────────────────────┐
│                     RAG ARCHITECTURE                          │
│                                                              │
│  ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐  │
│  │  User   │──▶│ Retriever│──▶│ Augment  │──▶│Generator│  │
│  │  Query  │   │(VectorDB)│   │(Context) │   │  (LLM)  │  │
│  └─────────┘   └──────────┘   └──────────┘   └─────────┘  │
│       ↑                                            │         │
│       └────────────────────────────────────────────┘         │
│                      Response                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 5.2 Traditional DB vs Vector DB

| Feature | Traditional DB | Vector DB |
|---------|---------------|-----------|
| **Data Type** | Structured (rows/cols) | Unstructured (embeddings) |
| **Query** | SQL (exact match) | Similarity search (nearest neighbor) |
| **Search** | Keyword-based | Semantic/meaning-based |
| **Use Case** | Transactions, reporting | AI retrieval, recommendations |
| **Examples** | PostgreSQL, MySQL | Pinecone, Weaviate, Chroma |

---

## 5.3 The RAG Pipeline: Ingestion

### Ingestion Architecture (Offline Process)

```
┌───────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Documents │──▶│  Chunk   │──▶│  Embed   │──▶│  Store   │
│           │   │  (Split) │   │(Vectorize│   │(VectorDB)│
│ PDF, DOCX │   │          │   │          │   │          │
│ TXT, HTML │   │ 512 chars│   │ OpenAI   │   │ Pinecone │
│ CSV, JSON │   │ overlap  │   │ ada-002  │   │ Weaviate │
└───────────┘   └──────────┘   └──────────┘   └──────────┘
```

**Steps:**
1. **Load** documents from source (S3, local, URLs)
2. **Chunk** documents into smaller pieces
3. **Embed** each chunk into a vector (array of numbers)
4. **Store** vectors with metadata in Vector DB

### Embedding Process

```python
from openai import OpenAI

client = OpenAI()

# Convert text to vector
response = client.embeddings.create(
    model="text-embedding-3-small",
    input="What is generative AI?"
)

# Result: array of 1536 floating-point numbers
vector = response.data[0].embedding
# [0.023, -0.014, 0.056, ...]  (1536 dimensions)
```

---

## 5.4 The RAG Pipeline: Retrieval

```
User Query: "What is our refund policy?"
     │
     ▼
┌──────────────┐
│ Embed Query  │  → [0.02, -0.01, 0.05, ...]
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────┐
│         Vector Database              │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │
│  │Doc 1│ │Doc 2│ │Doc 3│ │Doc N│  │
│  │0.91 │ │0.45 │ │0.87 │ │0.23 │  │  ← Similarity scores
│  └─────┘ └─────┘ └─────┘ └─────┘  │
└──────────────────────────────────────┘
       │
       ▼ Top-K results (e.g., K=3)
┌──────────────┐
│ Doc1 (0.91)  │  "Our refund policy states..."
│ Doc3 (0.87)  │  "Refunds are processed within..."
│ Doc2 (0.45)  │  "For returns, please contact..."
└──────────────┘
```

### Similarity Metrics

| Metric | Formula | Range | Best For |
|--------|---------|-------|----------|
| **Cosine Similarity** | cos(A,B) | [-1, 1] | Text embeddings |
| **Euclidean Distance** | √Σ(a-b)² | [0, ∞) | Dense vectors |
| **Dot Product** | A·B | (-∞, ∞) | Normalized vectors |


---

## 5.5 Augmented Generation

The retrieved context is injected into the prompt sent to the LLM:

```python
prompt = f"""
Answer the user's question based ONLY on the following context.
If the answer is not in the context, say "I don't know."

Context:
{retrieved_documents}

Question: {user_query}

Answer:
"""
```

---

## 5.6 Vector Database Types

### Architecture Diagrams Reference
> 📊 **Drawio Diagrams (MODULE5/PINECONE-RAG):**
> - VECTORDB-TYPES
> - WORKING-WITH-PINECONE
> - WORKING-WITH-HUGGINGFACE-DATASETS
> - PINECONE-SIMPLE-RAG
> - TIPS-RECOMMENDATIONS
> - TWO-STAGE-RAG
> - CHUNKING-STRATEGIES
> - CONTEXT-AWARE-CHUNKING
> - HYBRID-SEARCH-OPTIMIZATION

| Vector DB | Type | Key Features |
|-----------|------|-------------|
| **Pinecone** | Managed cloud | Serverless, auto-scaling, metadata filtering |
| **Weaviate** | Open source | GraphQL API, modules, hybrid search |
| **Chroma** | Open source | Lightweight, in-memory, Python-native |
| **Milvus** | Open source | Distributed, GPU-accelerated |
| **Qdrant** | Open source | Rust-based, filtering, payload storage |
| **pgvector** | Extension | PostgreSQL extension for embeddings |
| **FAISS** | Library | Facebook's in-memory similarity search |

### Working with Pinecone

```python
from pinecone import Pinecone, ServerlessSpec

# Initialize
pc = Pinecone(api_key="your-api-key")

# Create index
pc.create_index(
    name="genai-knowledge-base",
    dimension=1536,        # OpenAI embedding size
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1")
)

# Connect to index
index = pc.Index("genai-knowledge-base")

# Upsert vectors
index.upsert(vectors=[
    {
        "id": "doc-1",
        "values": [0.023, -0.014, ...],  # 1536-dim vector
        "metadata": {
            "source": "refund_policy.pdf",
            "page": 3,
            "text": "Our refund policy allows..."
        }
    }
])

# Query (search)
results = index.query(
    vector=query_embedding,
    top_k=5,
    include_metadata=True
)
```

---

## 5.7 Two-Stage RAG

```
┌───────────┐    ┌──────────────┐    ┌──────────────┐    ┌─────┐
│   Query   │───▶│ Stage 1:     │───▶│ Stage 2:     │───▶│ LLM │
│           │    │ Retrieval    │    │ Re-Ranking   │    │     │
│           │    │ (Top 20)     │    │ (Top 5)      │    │     │
└───────────┘    └──────────────┘    └──────────────┘    └─────┘
                  Vector Search       Cross-Encoder
                  (Fast, approximate) (Slow, accurate)
```

**Stage 1 — Retrieval:** Fast vector similarity (retrieve top 20)
**Stage 2 — Re-ranking:** Cross-encoder model scores relevance (select top 5)

---

## 5.8 Chunking Strategies

### Why Chunking Matters

Documents are too large to embed as a single vector. Chunking splits them into meaningful pieces.

| Strategy | Description | Best For |
|----------|-------------|----------|
| **Fixed Size** | Split every N characters/tokens | Simple docs |
| **Sentence** | Split at sentence boundaries | Articles |
| **Paragraph** | Split at paragraph breaks | Reports |
| **Recursive** | Try multiple separators | General purpose |
| **Semantic** | Split by meaning/topic change | Complex docs |
| **Context-Aware** | Use document structure (headers) | Technical docs |

### Chunking Parameters

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,       # Max characters per chunk
    chunk_overlap=50,     # Overlap between chunks
    separators=["\n\n", "\n", ". ", " "]  # Priority order
)

chunks = splitter.split_text(document_text)
```

### Context-Aware Chunking

```python
from langchain.text_splitter import MarkdownHeaderTextSplitter

headers_to_split = [
    ("#", "Header 1"),
    ("##", "Header 2"),
    ("###", "Header 3"),
]

splitter = MarkdownHeaderTextSplitter(headers_to_split)
chunks = splitter.split_text(markdown_document)
# Each chunk knows which section it belongs to
```

---

## 5.9 Hybrid Search

Combines **vector search** (semantic) with **keyword search** (BM25/TF-IDF) for better retrieval.

```
┌───────────┐
│   Query   │
└─────┬─────┘
      │
      ├──────────────────────────────────┐
      │                                  │
      ▼                                  ▼
┌──────────────┐              ┌──────────────────┐
│Vector Search │              │ Keyword Search   │
│(Semantic)    │              │ (BM25/Sparse)    │
│Score: 0.85   │              │ Score: 12.3      │
└──────┬───────┘              └────────┬─────────┘
       │                               │
       └───────────┬───────────────────┘
                   ▼
         ┌─────────────────┐
         │  Reciprocal Rank│
         │  Fusion (RRF)   │
         │  Combined Score │
         └─────────────────┘
```

### File-to-VectorDB Calculation

```
Document: 100 pages, ~500 words/page = 50,000 words
Tokens: ~66,000 tokens (1 word ≈ 1.3 tokens)
Chunk size: 512 tokens, overlap 50 tokens
Chunks: ~143 chunks
Embedding cost: 143 × $0.00002/1K tokens ≈ $0.002
Storage: 143 vectors × 1536 dims × 4 bytes = ~880 KB
```

---

### 📝 Chapter 5 Key Takeaways

1. RAG = Retrieval + Augmented + Generation (grounds LLM in real data)
2. Pipeline: Load → Chunk → Embed → Store → Retrieve → Generate
3. Vector DBs store embeddings; use cosine similarity for search
4. Pinecone is managed; Chroma is lightweight/local
5. Two-stage RAG: Fast retrieval → Accurate re-ranking
6. Chunk strategy matters: recursive splitter is a good default
7. Hybrid search (vector + keyword) gives best results
8. Overlap in chunks prevents losing context at boundaries

---
---


# Chapter 6: LangChain Framework

## 6.1 Why LangChain?

### Architecture Diagrams Reference
> 📊 **Drawio Diagrams (MODULE6):**
> - WHY-LANG-CHAIN
> - WORKING-WITH-LANGCHAIN
> - LC-AGENTIC-RAG-HYBRID-SEARCH
> - QUERY-TRANSLATION-TECH

### The Problem

Building LLM applications from scratch requires:
- Managing API calls to different providers
- Handling conversation memory
- Chaining multiple operations together
- Integrating with vector stores, databases, tools
- Error handling, retries, streaming

### LangChain Solution

LangChain is a **framework for building LLM-powered applications** with composable components.

```
┌─────────────────────────────────────────────────────────┐
│                    LANGCHAIN ECOSYSTEM                    │
├──────────────┬──────────────┬───────────────────────────┤
│  LangChain   │  LangSmith   │      LangGraph            │
│  (Framework) │  (Observ.)   │    (Agents/Workflows)     │
├──────────────┼──────────────┼───────────────────────────┤
│ Models       │ Tracing      │ State Machines            │
│ Prompts      │ Evaluation   │ Multi-Agent               │
│ Chains       │ Monitoring   │ Human-in-the-loop         │
│ Retrievers   │ Datasets     │ Persistence               │
│ Tools        │ Playground   │ Streaming                 │
└──────────────┴──────────────┴───────────────────────────┘
```

---

## 6.2 Core Components

### Chat Models

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

# Initialize model
llm = ChatOpenAI(
    model="gpt-4o",
    temperature=0.7,
    max_tokens=1024
)

# Simple invocation
response = llm.invoke([
    SystemMessage(content="You are a helpful AI assistant."),
    HumanMessage(content="What is RAG?")
])
print(response.content)
```

### Prompt Templates

```python
from langchain_core.prompts import ChatPromptTemplate

# Create template
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert in {domain}."),
    ("human", "{question}")
])

# Format with variables
formatted = prompt.invoke({
    "domain": "cloud computing",
    "question": "What is AWS Lambda?"
})
```

### Chains (LCEL - LangChain Expression Language)

```python
from langchain_core.output_parsers import StrOutputParser

# Chain: Prompt → LLM → Parser
chain = prompt | llm | StrOutputParser()

# Invoke the chain
result = chain.invoke({
    "domain": "GenAI",
    "question": "Explain RAG in 3 sentences"
})
```

### Retrievers

```python
from langchain_pinecone import PineconeVectorStore
from langchain_openai import OpenAIEmbeddings

# Create vector store retriever
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vectorstore = PineconeVectorStore(
    index_name="knowledge-base",
    embedding=embeddings
)

retriever = vectorstore.as_retriever(
    search_type="similarity",
    search_kwargs={"k": 5}
)

# Retrieve relevant documents
docs = retriever.invoke("What is our refund policy?")
```

---

## 6.3 RAG Chain with LangChain

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# RAG prompt
rag_prompt = ChatPromptTemplate.from_template("""
Answer the question based only on the following context:

Context: {context}

Question: {question}

Answer:
""")

# Format documents
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

# RAG Chain
rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | rag_prompt
    | llm
    | StrOutputParser()
)

# Use it
answer = rag_chain.invoke("What is our return policy?")
```

---

## 6.4 Agentic RAG with Hybrid Search

### What is Agentic RAG?

An agent that **decides when and how** to retrieve information, rather than always retrieving.

```
┌──────────┐    ┌──────────────┐    ┌────────────────────┐
│   User   │───▶│    Agent     │───▶│  Decision:         │
│  Query   │    │  (LLM-based) │    │  • Retrieve docs?  │
└──────────┘    └──────────────┘    │  • Use tool?       │
                       │             │  • Answer directly?│
                       │             └────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │Vector DB │  │  Web API  │  │Calculator│
  │(Retrieval│  │ (Search)  │  │  (Tool)  │
  └──────────┘  └──────────┘  └──────────┘
```

---

## 6.5 Query Translation Techniques

When user queries are unclear, **translate** them before retrieval:

| Technique | Description | When to Use |
|-----------|-------------|-------------|
| **Multi-Query** | Generate multiple query variations | Ambiguous queries |
| **RAG Fusion** | Multiple queries + reciprocal rank fusion | Complex topics |
| **Step-Back** | Generate broader question first | Specific details |
| **HyDE** | Generate hypothetical answer, then search | Abstract queries |
| **Decomposition** | Break complex query into sub-queries | Multi-part questions |

### Multi-Query Example

```python
from langchain.retrievers.multi_query import MultiQueryRetriever

retriever = MultiQueryRetriever.from_llm(
    retriever=vectorstore.as_retriever(),
    llm=llm
)

# User query: "What benefits does the company offer?"
# Generated queries:
#   1. "What are the employee benefits at the company?"
#   2. "List company benefits and perks"  
#   3. "What health and retirement benefits are available?"
```

---

### 📝 Chapter 6 Key Takeaways

1. LangChain provides composable building blocks for LLM apps
2. LCEL (pipe syntax): prompt | llm | parser — clean and readable
3. Chains link components; Agents make decisions dynamically
4. RAG Chain: Retriever → Format Docs → Prompt → LLM → Output
5. Agentic RAG decides whether to retrieve, use tools, or answer directly
6. Query translation improves retrieval for complex/ambiguous queries

---
---


# Chapter 7: Graph Databases & Neo4j

## 7.1 Why Graph Databases?

### Architecture Diagrams Reference
> 📊 **Drawio Diagrams (MODULE7):**
> - WHY-GRAPH-DB
> - WHAT-IS-NEO4J-N-CIPHER
> - CORE-COMPONENTS-OF-NEO4J
> - GRAPHS-ARE-EVERYWHERE
> - LAB-SETUP
> - READING-DATA
> - FINDING-RELATIONSHIPS
> - FILTERING-QUERIES

### The Limitations of Relational DBs for Connected Data

```
Relational DB (SQL):                Graph DB:
┌──────────────────────┐           (Person)-[:KNOWS]->(Person)
│ PERSON | KNOWS       │           (Person)-[:WORKS_AT]->(Company)
├────────┼─────────────┤           (Person)-[:LIVES_IN]->(City)
│ Alice  │ Bob         │
│ Alice  │ Carol       │           Direct traversal of relationships
│ Bob    │ Dave        │           No expensive JOINs!
└────────┴─────────────┘
  Multiple JOINs needed!
```

### When to Use Graph DB

| Use Case | Why Graph? |
|----------|-----------|
| Social networks | Friends-of-friends queries |
| Recommendation engines | "Users who bought X also bought Y" |
| Knowledge graphs | Entity relationships |
| Fraud detection | Pattern detection in transactions |
| Network topology | Infrastructure dependencies |
| **GenAI + Knowledge Graphs** | Structured retrieval for RAG |

---

## 7.2 Neo4j Fundamentals

### What is Neo4j?

Neo4j is the most popular **property graph database**. Data is stored as nodes, relationships, and properties.

### Core Components

```
┌────────────────────────────────────────────────────────┐
│                 NEO4J DATA MODEL                         │
│                                                          │
│  ┌─────────┐     ┌────────────┐     ┌─────────┐       │
│  │  NODE   │────▶│RELATIONSHIP│────▶│  NODE   │       │
│  │(Entity) │     │ (Edge)     │     │(Entity) │       │
│  │         │     │            │     │         │       │
│  │Props:   │     │Props:      │     │Props:   │       │
│  │ name    │     │ since:2020 │     │ name    │       │
│  │ age     │     │ weight:0.9 │     │ title   │       │
│  │         │     │            │     │         │       │
│  │Labels:  │     │Type:       │     │Labels:  │       │
│  │ :Person │     │ :WORKS_AT  │     │:Company │       │
│  └─────────┘     └────────────┘     └─────────┘       │
└────────────────────────────────────────────────────────┘
```

| Component | Description | Example |
|-----------|-------------|---------|
| **Node** | Entity/object | (:Person {name:"Alice"}) |
| **Label** | Node category | :Person, :Company, :City |
| **Relationship** | Connection between nodes | -[:WORKS_AT]-> |
| **Property** | Key-value attribute | {name: "Alice", age: 30} |

---

## 7.3 Cypher Query Language

### Basic CRUD Operations

```cypher
-- CREATE nodes
CREATE (alice:Person {name: "Alice", age: 30})
CREATE (acme:Company {name: "Acme", industry: "Energy"})

-- CREATE relationship
MATCH (a:Person {name: "Alice"}), (c:Company {name: "Acme"})
CREATE (a)-[:WORKS_AT {since: 2020}]->(c)

-- READ / MATCH
MATCH (p:Person)-[:WORKS_AT]->(c:Company)
WHERE c.name = "Acme"
RETURN p.name, c.name

-- UPDATE
MATCH (p:Person {name: "Alice"})
SET p.title = "Data Engineer"

-- DELETE
MATCH (p:Person {name: "Alice"})-[r:WORKS_AT]->()
DELETE r
```

### Finding Relationships

```cypher
-- Find all people Alice knows
MATCH (alice:Person {name: "Alice"})-[:KNOWS]->(friend)
RETURN friend.name

-- Find friends of friends (2 hops)
MATCH (alice:Person {name: "Alice"})-[:KNOWS*2]->(fof)
WHERE fof <> alice
RETURN DISTINCT fof.name

-- Shortest path between two people
MATCH path = shortestPath(
  (a:Person {name:"Alice"})-[*]-(b:Person {name:"Dave"})
)
RETURN path
```

### Filtering Queries

```cypher
-- WHERE clause filtering
MATCH (p:Person)
WHERE p.age > 25 AND p.city = "Portland"
RETURN p.name, p.age
ORDER BY p.age DESC
LIMIT 10

-- Pattern filtering
MATCH (p:Person)-[:WORKS_AT]->(c:Company)
WHERE c.industry = "Energy"
  AND NOT (p)-[:KNOWS]->(:Person {name: "Bob"})
RETURN p.name
```

---

## 7.4 LangChain + Graph DB (GraphRAG)

### Why GraphRAG?

Traditional RAG retrieves chunks by similarity. GraphRAG retrieves **connected knowledge** — following relationships between entities.

```python
from langchain_community.graphs import Neo4jGraph
from langchain.chains import GraphCypherQAChain

# Connect to Neo4j
graph = Neo4jGraph(
    url="bolt://localhost:7687",
    username="neo4j",
    password="password"
)

# Create QA chain
chain = GraphCypherQAChain.from_llm(
    llm=llm,
    graph=graph,
    verbose=True
)

# Natural language query → Cypher → Result → Natural language answer
result = chain.invoke(
    "Who works at Acme and knows someone in the AI team?"
)
```

### Graph + Vector Hybrid Approach

```
User Query
    │
    ├──── Vector Search ──── Semantic similarity chunks
    │
    └──── Graph Traversal ── Related entities & relationships
                │
                ▼
         Combined Context → LLM → Rich Answer
```

---

## 7.5 GraphDB Final Project: Airline Data

### Project Overview
- Generate synthetic airline data (flights, airports, passengers)
- Inject into Neo4j as a knowledge graph
- Build LangChain-powered Q&A over the graph
- Natural language queries about flight connections, routes, etc.

---

### 📝 Chapter 7 Key Takeaways

1. Graph DBs excel at relationship-heavy queries (no expensive JOINs)
2. Neo4j: Nodes + Relationships + Properties + Labels
3. Cypher is the query language (MATCH/CREATE/WHERE/RETURN)
4. GraphRAG combines graph traversal with LLM generation
5. Use graph for structured knowledge, vector for unstructured text
6. Hybrid (Graph + Vector) gives the richest retrieval

---
---


# Chapter 8: LangGraph — Agentic Workflows

## 8.1 Why LangGraph?

### Architecture Diagrams Reference
> 📊 **Drawio Diagrams (MODULE8/INTRODUCTION):**
> - WHY-LANG-GRAPH
> - SIMPLE-GRAPH
> - LANG-SMITH-STUDIO
> - CHAINS
> - ROUTER
> - AGENT
> - AGENT-WITH-MEMORY
> - PERSISTENCE
> - PERSISTENCE-POSTGRES
>
> 📊 **Drawio Diagrams (MODULE8/STATE-N-MEMORY) — 5 tabs:**
> - STATE-SCHEMA
> - MULTIPLE-SCHEMAS
> - TRIM-N-FILTER-MESSAGES
> - CHAT-SUMMARIZATION
> - CHATBOT-WITH-EXTERNAL-MEMORY

### Limitations of Simple Chains

| Simple Chains | LangGraph Agents |
|---------------|-----------------|
| Linear execution | Conditional branching |
| No loops | Cycles and loops allowed |
| No state | Stateful execution |
| No decisions | Dynamic decision-making |
| No persistence | Checkpoint and resume |
| Single path | Multi-path workflows |

### What is LangGraph?

LangGraph is a framework for building **stateful, multi-actor applications** with LLMs. It models applications as **graphs** with:
- **Nodes** — Functions/steps that process state
- **Edges** — Transitions between nodes (can be conditional)
- **State** — Shared data passed between nodes

---

## 8.2 Simple Graph

```python
from langgraph.graph import StateGraph, START, END
from typing import TypedDict

# Define state
class AgentState(TypedDict):
    messages: list
    next_step: str

# Define nodes (functions)
def classify_intent(state: AgentState) -> AgentState:
    """Classify user intent."""
    # LLM classifies the message
    intent = llm.invoke("Classify: " + state["messages"][-1])
    state["next_step"] = intent
    return state

def handle_question(state: AgentState) -> AgentState:
    """Answer a question."""
    answer = llm.invoke(state["messages"][-1])
    state["messages"].append(answer)
    return state

def handle_task(state: AgentState) -> AgentState:
    """Execute a task."""
    result = execute_task(state["messages"][-1])
    state["messages"].append(result)
    return state

# Build graph
graph = StateGraph(AgentState)
graph.add_node("classify", classify_intent)
graph.add_node("question", handle_question)
graph.add_node("task", handle_task)

# Add edges
graph.add_edge(START, "classify")
graph.add_conditional_edges(
    "classify",
    lambda state: state["next_step"],
    {"question": "question", "task": "task"}
)
graph.add_edge("question", END)
graph.add_edge("task", END)

# Compile and run
app = graph.compile()
result = app.invoke({"messages": ["What is RAG?"], "next_step": ""})
```

### Visual Representation

```
         ┌─────────┐
         │  START  │
         └────┬────┘
              │
              ▼
       ┌──────────────┐
       │   Classify   │
       │   Intent     │
       └──────┬───────┘
              │
     ┌────────┼────────┐
     │ question         │ task
     ▼                  ▼
┌──────────┐    ┌──────────┐
│ Answer   │    │ Execute  │
│ Question │    │   Task   │
└────┬─────┘    └────┬─────┘
     │               │
     └───────┬───────┘
             ▼
         ┌───────┐
         │  END  │
         └───────┘
```

---

## 8.3 Chains in LangGraph

```python
# Sequential chain (linear graph)
graph = StateGraph(State)
graph.add_node("step1", process_input)
graph.add_node("step2", generate_response)
graph.add_node("step3", format_output)

graph.add_edge(START, "step1")
graph.add_edge("step1", "step2")
graph.add_edge("step2", "step3")
graph.add_edge("step3", END)
```

---

## 8.4 Router Pattern

```python
# Router: Decide which path to take
def router(state):
    """Route based on query type."""
    if "code" in state["query"].lower():
        return "code_agent"
    elif "data" in state["query"].lower():
        return "data_agent"
    else:
        return "general_agent"

graph.add_conditional_edges(
    "classifier",
    router,
    {
        "code_agent": "code_node",
        "data_agent": "data_node",
        "general_agent": "general_node"
    }
)
```

---

## 8.5 Agent Pattern (ReAct Loop)

The **ReAct** (Reason + Act) pattern creates an agent that can use tools in a loop:

```
┌─────────┐     ┌──────────┐     ┌──────────┐
│  START  │────▶│  Agent   │────▶│  Tools   │
└─────────┘     │ (Reason) │     │  (Act)   │
                └────┬─────┘     └────┬─────┘
                     │                │
                     │◀───────────────┘
                     │   (Loop until done)
                     │
                     ▼ (Done)
                ┌─────────┐
                │   END   │
                └─────────┘
```

```python
from langgraph.prebuilt import create_react_agent

# Define tools
tools = [search_tool, calculator_tool, database_tool]

# Create ReAct agent
agent = create_react_agent(
    model=llm,
    tools=tools
)

# Run
result = agent.invoke({
    "messages": [("user", "What's the weather in Portland?")]
})
```

---

## 8.6 State & Memory

### State Schema

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class ChatState(TypedDict):
    messages: Annotated[list, add_messages]  # Append-only messages
    user_info: dict                           # User context
    tool_results: list                        # Tool outputs
    iteration_count: int                      # Loop counter
```

### Memory Strategies in LangGraph

| Strategy | Implementation | Use Case |
|----------|---------------|----------|
| **Full History** | Keep all messages in state | Short conversations |
| **Trim Messages** | Keep last N messages | Medium conversations |
| **Filter Messages** | Remove tool messages | Clean context |
| **Summarize** | LLM summarizes older messages | Long conversations |
| **External Memory** | Store in DB, retrieve relevant | Multi-session |

### Trim & Filter Messages

```python
from langchain_core.messages import trim_messages

# Keep only last 10 messages, max 1000 tokens
trimmed = trim_messages(
    state["messages"],
    max_tokens=1000,
    strategy="last",
    token_counter=llm
)
```

### Chat Summarization

```python
def summarize_conversation(state):
    """Summarize old messages to save context."""
    summary_prompt = f"""
    Summarize this conversation in 2-3 sentences:
    {state["messages"][:-5]}  # Summarize all except last 5
    """
    summary = llm.invoke(summary_prompt)
    
    # Replace old messages with summary
    state["messages"] = [
        SystemMessage(content=f"Previous conversation summary: {summary}"),
        *state["messages"][-5:]  # Keep last 5 messages
    ]
    return state
```

---

## 8.7 Persistence & Checkpointing

### Why Persistence?

- Resume conversations after server restart
- Human-in-the-loop approval workflows
- Time travel (rollback to previous state)
- Multi-session chatbots

```python
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver

# In-memory (development)
memory = MemorySaver()

# PostgreSQL (production)
memory = PostgresSaver.from_conn_string(
    "postgresql://user:pass@localhost/langgraph"
)

# Compile with checkpointer
app = graph.compile(checkpointer=memory)

# Invoke with thread_id for persistence
config = {"configurable": {"thread_id": "user-123"}}
result = app.invoke({"messages": [("user", "Hello")]}, config)

# Later... resume same conversation
result2 = app.invoke({"messages": [("user", "Remember me?")]}, config)
```

---

## 8.8 Human-in-the-Loop

```python
from langgraph.graph import StateGraph
from langgraph.checkpoint.memory import MemorySaver

# Add interrupt point
graph.add_node("approve", human_approval_node)

# Graph pauses at "approve" node, waits for human input
app = graph.compile(
    checkpointer=MemorySaver(),
    interrupt_before=["approve"]  # Pause here
)
```

---

## 8.9 LangGraph Project: Chatbot with Persistence

### Project Architecture

```
┌──────────┐    ┌──────────────────────────────────────────┐
│   User   │───▶│              LangGraph Agent              │
│          │    │                                           │
│          │    │  ┌────────┐   ┌────────┐   ┌────────┐   │
│          │    │  │Classify│──▶│ Route  │──▶│ Execute│   │
│          │    │  └────────┘   └────────┘   └────────┘   │
│          │    │                                    │      │
│          │    │  ┌────────────────────────────┐   │      │
│          │◀───│  │      PostgreSQL             │◀──┘      │
│          │    │  │  (Checkpoints + Memory)     │          │
│          │    │  └────────────────────────────┘          │
└──────────┘    └──────────────────────────────────────────┘
```

---

### 📝 Chapter 8 Key Takeaways

1. LangGraph = State + Nodes + Edges (graph-based workflows)
2. Nodes are functions; Edges connect them (can be conditional)
3. ReAct pattern: Agent reasons → uses tools → loops until done
4. State schema defines what data flows through the graph
5. Memory: trim, filter, summarize, or externalize
6. Persistence via PostgreSQL for production (thread-based)
7. Human-in-the-loop: interrupt_before for approval workflows

---
---


# Chapter 9: Model Context Protocol (MCP)

## 9.1 What is MCP?

### Overview

The **Model Context Protocol (MCP)** is an open protocol that enables AI models/agents to interact with external tools, data sources, and services through a standardized interface.

### The Problem MCP Solves

```
Without MCP:                        With MCP:
┌─────┐                             ┌─────┐
│Agent│──custom code──▶Tool A       │Agent│──MCP──▶┌──────────┐
│     │──custom code──▶Tool B       │     │        │MCP Server│
│     │──custom code──▶Tool C       │     │        │          │
│     │──custom code──▶Tool D       └─────┘        │• Tool A  │
└─────┘                                            │• Tool B  │
  N custom integrations                            │• Tool C  │
                                                   └──────────┘
                                      1 standard protocol
```

### MCP Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        MCP ARCHITECTURE                        │
│                                                               │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │   Host   │    │  MCP Client  │    │   MCP Server     │   │
│  │(IDE/App) │───▶│  (Protocol   │───▶│  (Tool Provider) │   │
│  │          │    │   Handler)   │    │                  │   │
│  │ Kiro     │    │              │    │ • Tools          │   │
│  │ Claude   │    │ JSON-RPC     │    │ • Resources      │   │
│  │ ChatGPT  │    │ over stdio   │    │ • Prompts        │   │
│  └──────────┘    └──────────────┘    └──────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Host** | Application that uses MCP (IDE, chatbot) |
| **Client** | Protocol handler within the host |
| **Server** | Provides tools/resources via MCP |
| **Tools** | Functions the AI can call |
| **Resources** | Data sources the AI can read |
| **Prompts** | Pre-built prompt templates |

---

## 9.2 MCP Server Configuration

### mcp.json Configuration

```json
{
  "mcpServers": {
    "weather": {
      "command": "uvx",
      "args": ["weather-mcp-server"],
      "env": {
        "API_KEY": "your-api-key"
      },
      "disabled": false,
      "autoApprove": ["get_weather"]
    },
    "database": {
      "command": "python",
      "args": ["./mcp_servers/db_server.py"],
      "env": {
        "DB_URL": "postgresql://localhost/mydb"
      }
    }
  }
}
```

### Transport Types

| Transport | Protocol | Use Case |
|-----------|----------|----------|
| **stdio** | Standard I/O (stdin/stdout) | Local servers |
| **SSE** | Server-Sent Events over HTTP | Remote servers |
| **WebSocket** | Bidirectional WebSocket | Real-time servers |

---

## 9.3 Building an MCP Server (Python)

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# Create server
server = Server("my-genai-tools")

@server.list_tools()
async def list_tools():
    """Define available tools."""
    return [
        Tool(
            name="search_knowledge_base",
            description="Search the company knowledge base",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    },
                    "top_k": {
                        "type": "integer",
                        "default": 5
                    }
                },
                "required": ["query"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    """Handle tool calls."""
    if name == "search_knowledge_base":
        results = await vector_db.search(
            query=arguments["query"],
            top_k=arguments.get("top_k", 5)
        )
        return [TextContent(
            type="text",
            text=format_results(results)
        )]

# Run server
async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write)
```

---

## 9.4 MCP Project: Travel Agent with LangGraph + MCP

### Project Architecture

```
┌──────────────────────────────────────────────────────────┐
│                 TRAVEL AGENT (LangGraph + MCP)            │
│                                                           │
│  ┌────────┐    ┌────────────────┐    ┌───────────────┐  │
│  │  User  │───▶│  LangGraph     │───▶│  MCP Servers  │  │
│  │        │    │  Agent Graph   │    │               │  │
│  │"Plan a │    │                │    │ • Flights API │  │
│  │ trip to│    │ ┌────┐ ┌────┐ │    │ • Hotels API  │  │
│  │ Paris" │    │ │Plan│→│Book│ │    │ • Weather API │  │
│  │        │    │ └────┘ └────┘ │    │ • Maps API    │  │
│  └────────┘    └────────────────┘    └───────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

### 📝 Chapter 9 Key Takeaways

1. MCP standardizes how AI agents connect to external tools
2. Architecture: Host → Client → Server (JSON-RPC over stdio)
3. Servers expose Tools, Resources, and Prompts
4. Configure via mcp.json in your IDE/workspace
5. Build servers with Python mcp library
6. Combines naturally with LangGraph for agentic workflows

---
---


# Chapter 10: AWS Bedrock & AgentCore

## 10.1 What is AWS Bedrock?

### Overview

**Amazon Bedrock** is a fully managed service for building GenAI applications using foundation models (FMs) from leading AI companies.

### Bedrock Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      AWS BEDROCK                                 │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Foundation Models                        │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │Anthropic │ │  Meta    │ │ Amazon   │ │ Cohere   │  │   │
│  │  │ Claude   │ │  Llama   │ │  Titan   │ │          │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐              │   │
│  │  │ Mistral  │ │ Stability│ │  AI21    │              │   │
│  │  │          │ │   AI     │ │  Labs    │              │   │
│  │  └──────────┘ └──────────┘ └──────────┘              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────┐  ┌─────────────────┐  ┌─────────────┐   │
│  │  Knowledge Bases  │  │   Guardrails    │  │   Agents    │   │
│  │  (Managed RAG)    │  │  (Safety/Policy)│  │(Orchestrate)│   │
│  └──────────────────┘  └─────────────────┘  └─────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### Available Models in Bedrock

| Provider | Model | Best For |
|----------|-------|----------|
| Anthropic | Claude 3.5 Sonnet | General purpose, coding |
| Anthropic | Claude 3 Haiku | Fast, cost-effective |
| Meta | Llama 3.1 405B | Open-weight, large scale |
| Amazon | Titan Text/Embed | AWS-native, embeddings |
| Mistral | Mistral Large | European, multilingual |
| Stability AI | Stable Diffusion | Image generation |

---

## 10.2 Using Bedrock (Python/boto3)

### Basic Invocation

```python
import boto3
import json

bedrock = boto3.client('bedrock-runtime', region_name='us-west-2')

# Invoke Claude via Bedrock
response = bedrock.invoke_model(
    modelId='anthropic.claude-3-haiku-20240307-v1:0',
    body=json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1024,
        "messages": [
            {"role": "user", "content": "What is AWS Bedrock?"}
        ]
    })
)

result = json.loads(response['body'].read())
print(result['content'][0]['text'])
```

### Bedrock Knowledge Bases (Managed RAG)

```python
bedrock_agent = boto3.client('bedrock-agent-runtime')

# Query knowledge base
response = bedrock_agent.retrieve_and_generate(
    input={"text": "What is our refund policy?"},
    retrieveAndGenerateConfiguration={
        "type": "KNOWLEDGE_BASE",
        "knowledgeBaseConfiguration": {
            "knowledgeBaseId": "KB_ID_HERE",
            "modelArn": "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-haiku-20240307-v1:0"
        }
    }
)

print(response['output']['text'])
```

---

## 10.3 Bedrock Guardrails

### What are Guardrails?

Safety policies that filter harmful, inappropriate, or off-topic content from LLM inputs and outputs.

```
┌────────┐    ┌────────────────┐    ┌─────────┐    ┌────────────────┐    ┌────────┐
│  User  │───▶│ Input          │───▶│  LLM    │───▶│ Output         │───▶│  User  │
│  Input │    │ Guardrail      │    │ (Claude)│    │ Guardrail      │    │Response│
│        │    │ • Topic filter │    │         │    │ • PII filter   │    │        │
│        │    │ • Deny list    │    │         │    │ • Toxic filter │    │        │
│        │    │ • Word filter  │    │         │    │ • Hallucination│    │        │
└────────┘    └────────────────┘    └─────────┘    └────────────────┘    └────────┘
```

### Guardrail Policies (from course materials)

| Policy | File | Description |
|--------|------|-------------|
| Late Fee | 01_late_fee_policy.txt | Rules for late payment fees |
| Transaction Dispute | 02_transaction_dispute_policy.txt | Dispute resolution process |
| Refund | 03_refund_policy.txt | Refund eligibility criteria |
| Loan Pre-eligibility | 04_loan_pre_eligibility_policy.txt | Loan qualification checks |
| KYC Verification | 05_kyc_customer_verification_policy.txt | Customer identity verification |
| Service Case Mgmt | 06_service_case_management_sop.txt | Case handling procedures |
| AI Agent Guardrails | 07_ai_agent_banking_guardrails.txt | AI behavior boundaries |

---

## 10.4 AWS AgentCore

### What is AgentCore?

**AWS AgentCore** is an AWS service for deploying and managing AI agents at scale in production.

```
┌────────────────────────────────────────────────────────────┐
│                    AWS AGENTCORE                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Agent Runtime                         │   │
│  │  ┌──────────┐  ┌───────────┐  ┌────────────────┐   │   │
│  │  │  Agent   │  │   Tools   │  │  Orchestration │   │   │
│  │  │  Logic   │  │ (Actions) │  │  (Workflow)    │   │   │
│  │  └──────────┘  └───────────┘  └────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │  Observ-    │  │  Security   │  │   Scaling &     │   │
│  │  ability    │  │  & Auth     │  │   Management    │   │
│  │  (Tracing)  │  │  (IAM)      │  │  (Auto-scale)  │   │
│  └─────────────┘  └─────────────┘  └─────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Agent Hosting** | Deploy agents as managed services |
| **Tool Integration** | Connect to AWS services + custom APIs |
| **Guardrails** | Built-in safety and compliance |
| **Observability** | Tracing, logging, monitoring |
| **Memory** | Managed conversation persistence |
| **Scaling** | Auto-scale based on demand |
| **Security** | IAM-based access control |

---

## 10.5 Bedrock Agents vs AgentCore

| Feature | Bedrock Agents | AgentCore |
|---------|---------------|-----------|
| **Scope** | AWS-managed RAG + tools | Full agent lifecycle |
| **Models** | Bedrock FMs only | Any model (Bedrock, self-hosted) |
| **Customization** | Limited orchestration | Full workflow control |
| **Framework** | AWS-native | Framework-agnostic |
| **Use Case** | Simple Q&A with tools | Complex multi-step agents |

---

### 📝 Chapter 10 Key Takeaways

1. Bedrock provides managed access to foundation models (Claude, Llama, Titan)
2. Knowledge Bases = managed RAG (S3 docs → embeddings → retrieval)
3. Guardrails filter unsafe/off-topic content at input and output
4. AgentCore deploys and scales production AI agents
5. Use Bedrock for simple GenAI apps; AgentCore for complex agents
6. Always apply guardrails in production (PII, toxicity, topic control)

---
---


# Chapter 11: Kubernetes & EKS (Sunday Sessions)

## 11.1 Introduction to Container Orchestration

### Architecture Diagrams Reference
> 📊 **Drawio Diagrams (SUNDAY-SESSIONS/EKS):**
> - INTRODUCTION
> - K8S-ARCH
> - INSTALLATION
> - WORKING-WITH-K8S
> - RESOURCE-MGMT
> - DAEMONSETS
> - CONFIGMAP-SECRETS
> - INGRESS-EXAMPLE
> - INGRESS

### Why Kubernetes for GenAI?

| Scenario | Why K8s? |
|----------|----------|
| Multiple AI microservices | Orchestrate containers at scale |
| GPU workloads | Schedule on GPU nodes |
| Auto-scaling | Scale inference servers on demand |
| Rolling updates | Deploy new model versions safely |
| Service mesh | Manage inter-service communication |

---

## 11.2 Kubernetes Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    KUBERNETES CLUSTER                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              CONTROL PLANE (Master)                    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ │  │
│  │  │API Server│ │Scheduler │ │  etcd  │ │Controller│ │  │
│  │  │          │ │          │ │(K-V DB)│ │ Manager  │ │  │
│  │  └──────────┘ └──────────┘ └────────┘ └──────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────┼──────────────────────────────┐ │
│  │              WORKER NODES                              │ │
│  │                                                        │ │
│  │  ┌─────────────────┐    ┌─────────────────┐          │ │
│  │  │   Worker Node 1  │    │   Worker Node 2  │         │ │
│  │  │ ┌─────┐ ┌─────┐ │    │ ┌─────┐ ┌─────┐ │         │ │
│  │  │ │Pod 1│ │Pod 2│ │    │ │Pod 3│ │Pod 4│ │         │ │
│  │  │ │     │ │     │ │    │ │     │ │     │ │         │ │
│  │  │ └─────┘ └─────┘ │    │ └─────┘ └─────┘ │         │ │
│  │  │  kubelet, kube-  │    │  kubelet, kube-  │         │ │
│  │  │  proxy           │    │  proxy           │         │ │
│  │  └─────────────────┘    └─────────────────┘          │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Role |
|-----------|------|
| **API Server** | Front door to the cluster (REST API) |
| **etcd** | Distributed key-value store (cluster state) |
| **Scheduler** | Assigns pods to nodes |
| **Controller Manager** | Maintains desired state |
| **kubelet** | Agent on each node, manages pods |
| **kube-proxy** | Network proxy, routes traffic |

---

## 11.3 Core Kubernetes Objects

### Pod (Smallest deployable unit)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: genai-inference
  labels:
    app: genai
spec:
  containers:
  - name: model-server
    image: 123456789.dkr.ecr.us-west-2.amazonaws.com/genai-app:v1
    ports:
    - containerPort: 8000
    resources:
      requests:
        memory: "512Mi"
        cpu: "500m"
      limits:
        memory: "1Gi"
        cpu: "1000m"
```

### Deployment (Manages replica sets)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: genai-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: genai-api
  template:
    metadata:
      labels:
        app: genai-api
    spec:
      containers:
      - name: api
        image: genai-api:v2
        ports:
        - containerPort: 8000
```

### Service (Network access to pods)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: genai-api-service
spec:
  type: LoadBalancer
  selector:
    app: genai-api
  ports:
  - port: 80
    targetPort: 8000
```

---

## 11.4 Resource Management

```yaml
resources:
  requests:          # Minimum guaranteed
    memory: "256Mi"
    cpu: "250m"      # 0.25 CPU cores
  limits:            # Maximum allowed
    memory: "512Mi"
    cpu: "500m"
```

### Horizontal Pod Autoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: genai-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: genai-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## 11.5 ConfigMaps & Secrets

### ConfigMap (Non-sensitive config)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: genai-config
data:
  MODEL_NAME: "claude-3-haiku"
  TEMPERATURE: "0.7"
  MAX_TOKENS: "1024"
  VECTOR_DB_URL: "https://pinecone.io"
```

### Secrets (Sensitive data)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: genai-secrets
type: Opaque
data:
  OPENAI_API_KEY: base64-encoded-key
  DB_PASSWORD: base64-encoded-password
```

### Using in Pods

```yaml
spec:
  containers:
  - name: app
    envFrom:
    - configMapRef:
        name: genai-config
    - secretRef:
        name: genai-secrets
```

---

## 11.6 DaemonSets

Run one pod per node (monitoring, logging, etc.):

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: log-collector
spec:
  selector:
    matchLabels:
      app: log-collector
  template:
    spec:
      containers:
      - name: fluentd
        image: fluentd:latest
```

---

## 11.7 Ingress

### Ingress Controller (Route external traffic)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: genai-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: genai.mycompany.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: genai-api-service
            port:
              number: 80
      - path: /chat
        pathType: Prefix
        backend:
          service:
            name: chat-service
            port:
              number: 80
```

---

## 11.8 Amazon EKS (Elastic Kubernetes Service)

### What is EKS?

Managed Kubernetes on AWS — AWS handles the control plane, you manage worker nodes.

```
┌──────────────────────────────────────────────────────────┐
│                       AWS EKS                             │
│                                                           │
│  ┌────────────────────────┐  ┌────────────────────────┐ │
│  │ AWS-Managed Control    │  │  Your Worker Nodes     │ │
│  │ Plane (HA, patched)    │  │  (EC2 or Fargate)      │ │
│  │                        │  │                        │ │
│  │ API Server, etcd,      │  │  ┌────┐ ┌────┐ ┌────┐│ │
│  │ Scheduler, Controllers │  │  │Pod │ │Pod │ │Pod ││ │
│  └────────────────────────┘  │  └────┘ └────┘ └────┘│ │
│                               └────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

### 📝 Chapter 11 Key Takeaways

1. K8s orchestrates containers at scale (ideal for AI microservices)
2. Pod = smallest unit; Deployment = manages replicas; Service = networking
3. Resource requests/limits prevent noisy neighbors
4. ConfigMaps for config; Secrets for sensitive data
5. HPA auto-scales pods based on CPU/memory
6. Ingress routes external traffic to internal services
7. EKS = managed K8s on AWS (control plane is AWS-managed)

---
---


# Chapter 12: Final Project — Capstone

## 12.1 Project Overview: Python + AWS GenAI Application

### Project Requirements (PYTHON-AWS-FINALPROJECT)

Build an end-to-end GenAI application that combines:
- **Python** backend (FastAPI/Flask)
- **AWS services** (Lambda, API Gateway, S3, Bedrock)
- **RAG pipeline** (Vector DB + LLM)
- **Agentic capabilities** (LangGraph/LangChain)

---

## 12.2 Recommended Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                   FINAL PROJECT ARCHITECTURE                         │
│                                                                     │
│  ┌────────┐    ┌─────────────┐    ┌──────────────────────────┐    │
│  │Frontend│───▶│ API Gateway │───▶│      Lambda / ECS        │    │
│  │(React/ │    │  (REST)     │    │                          │    │
│  │ Chat)  │    └─────────────┘    │  ┌────────────────────┐ │    │
│  └────────┘                       │  │  LangGraph Agent   │ │    │
│                                    │  │                    │ │    │
│                                    │  │  ┌──────┐         │ │    │
│                                    │  │  │Router│         │ │    │
│                                    │  │  └──┬───┘         │ │    │
│                                    │  │     │             │ │    │
│                                    │  │  ┌──┴──┐ ┌─────┐ │ │    │
│                                    │  │  │RAG  │ │Tools│ │ │    │
│                                    │  │  │Node │ │Node │ │ │    │
│                                    │  │  └──┬──┘ └──┬──┘ │ │    │
│                                    │  └─────┼───────┼────┘ │    │
│                                    └────────┼───────┼──────┘    │
│                                              │       │           │
│  ┌──────────────────────────────────────────┼───────┼─────────┐│
│  │              AWS Services                 │       │         ││
│  │                                           │       │         ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐       │         ││
│  │  │ Pinecone │  │  Bedrock │  │    S3    │       │         ││
│  │  │(VectorDB)│  │ (Claude) │  │  (Docs)  │       │         ││
│  │  └──────────┘  └──────────┘  └──────────┘       │         ││
│  │                                                   │         ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐       │         ││
│  │  │PostgreSQL│  │ DynamoDB │  │CloudWatch│       │         ││
│  │  │  (RDS)   │  │ (Sessions│  │ (Logs)   │       │         ││
│  │  └──────────┘  └──────────┘  └──────────┘       │         ││
│  └──────────────────────────────────────────────────┘         ││
└────────────────────────────────────────────────────────────────┘│
```

---

## 12.3 Implementation Steps

### Step 1: Setup & Infrastructure

```bash
# Project structure
genai-capstone/
├── infrastructure/
│   ├── cdk/                    # AWS CDK (IaC)
│   └── docker/
│       └── Dockerfile
├── src/
│   ├── agents/
│   │   ├── graph.py            # LangGraph agent definition
│   │   ├── nodes.py            # Agent nodes
│   │   └── tools.py            # Agent tools
│   ├── rag/
│   │   ├── ingest.py           # Document ingestion
│   │   ├── retriever.py        # Vector store retrieval
│   │   └── chunking.py         # Chunking strategies
│   ├── api/
│   │   ├── main.py             # FastAPI app
│   │   └── routes.py           # API endpoints
│   └── config/
│       └── settings.py         # Configuration
├── data/
│   └── documents/              # Source documents
├── tests/
├── requirements.txt
└── README.md
```

### Step 2: RAG Pipeline

```python
# src/rag/ingest.py
from langchain_community.document_loaders import S3DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore

def ingest_documents():
    # 1. Load from S3
    loader = S3DirectoryLoader(bucket="genai-docs", prefix="policies/")
    documents = loader.load()
    
    # 2. Chunk
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=512, chunk_overlap=50
    )
    chunks = splitter.split_documents(documents)
    
    # 3. Embed & Store
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    PineconeVectorStore.from_documents(
        chunks, embeddings, index_name="capstone-kb"
    )
```

### Step 3: LangGraph Agent

```python
# src/agents/graph.py
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.postgres import PostgresSaver

def build_agent():
    graph = StateGraph(AgentState)
    
    graph.add_node("classify", classify_intent)
    graph.add_node("rag", rag_retrieval_node)
    graph.add_node("tools", tool_execution_node)
    graph.add_node("respond", generate_response)
    
    graph.add_edge(START, "classify")
    graph.add_conditional_edges("classify", route_decision)
    graph.add_edge("rag", "respond")
    graph.add_edge("tools", "respond")
    graph.add_edge("respond", END)
    
    checkpointer = PostgresSaver.from_conn_string(DB_URL)
    return graph.compile(checkpointer=checkpointer)
```

### Step 4: API Layer

```python
# src/api/main.py
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="GenAI Capstone API")

class ChatRequest(BaseModel):
    message: str
    session_id: str

@app.post("/chat")
async def chat(request: ChatRequest):
    config = {"configurable": {"thread_id": request.session_id}}
    result = agent.invoke(
        {"messages": [("user", request.message)]},
        config
    )
    return {"response": result["messages"][-1].content}
```

### Step 5: Deploy to AWS

```bash
# Build container
docker build -t genai-capstone .

# Push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URL
docker tag genai-capstone:latest $ECR_URL/genai-capstone:latest
docker push $ECR_URL/genai-capstone:latest

# Deploy via Lambda container or ECS
```

---

## 12.4 Evaluation Criteria

| Criteria | Weight | Description |
|----------|--------|-------------|
| **Architecture** | 20% | Clean design, proper AWS services usage |
| **RAG Quality** | 25% | Retrieval accuracy, chunking strategy |
| **Agent Logic** | 25% | LangGraph workflow, tool usage |
| **Code Quality** | 15% | Clean code, error handling, logging |
| **Documentation** | 10% | README, API docs, architecture diagram |
| **Presentation** | 5% | Demo and explanation |

---

### 📝 Chapter 12 Key Takeaways

1. Combine all learned skills: Python + AWS + RAG + LangGraph + MCP
2. Architecture: API Gateway → Lambda/ECS → LangGraph → Bedrock + Pinecone
3. RAG pipeline: S3 → Chunk → Embed → Pinecone → Retrieve → Generate
4. Agent uses LangGraph with conditional routing and persistence
5. Deploy via Docker container to Lambda or ECS
6. Always include guardrails, error handling, and logging

---
---


# Appendix A: Daily Learning Log Template

## How to Use This Log

Track your daily progress through the GenAI bootcamp. Record what you learned, practiced, and questions you have.

---

### Daily Log Entry Template

```
═══════════════════════════════════════════════════
DATE: [YYYY-MM-DD]  |  DAY: [#]  |  MODULE: [#]
═══════════════════════════════════════════════════

📚 TOPICS COVERED:
• Topic 1: ________________________________
• Topic 2: ________________________________
• Topic 3: ________________________________

💻 HANDS-ON PRACTICE:
• Lab/Exercise: ____________________________
• Code written: ____________________________
• Tools used: ______________________________

🔑 KEY LEARNINGS (Top 3):
1. ________________________________________
2. ________________________________________
3. ________________________________________

❓ QUESTIONS / DOUBTS:
• Q1: _____________________________________
• Q2: _____________________________________

📊 DIAGRAMS REVIEWED:
• Drawio file: _____________________________
• Tab names: ______________________________

✅ COMPLETED:
[ ] Read theory materials
[ ] Completed lab exercises
[ ] Reviewed architecture diagrams
[ ] Practiced coding
[ ] Took notes

📝 NOTES:
_____________________________________________
_____________________________________________

🎯 TOMORROW'S PLAN:
_____________________________________________
═══════════════════════════════════════════════════
```

---

## Sample Weekly Summary Template

```
╔═══════════════════════════════════════════════════╗
║  WEEK [#] SUMMARY  |  [Date Range]               ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  MODULE: _______________                          ║
║                                                   ║
║  CONCEPTS MASTERED:                               ║
║  ✓ _______________________________________________║
║  ✓ _______________________________________________║
║  ✓ _______________________________________________║
║                                                   ║
║  LABS COMPLETED:                                  ║
║  ✓ _______________________________________________║
║  ✓ _______________________________________________║
║                                                   ║
║  AREAS NEEDING REVIEW:                            ║
║  ○ _______________________________________________║
║  ○ _______________________________________________║
║                                                   ║
║  CONFIDENCE LEVEL: [ ] Low [ ] Medium [ ] High    ║
╚═══════════════════════════════════════════════════╝
```

---
---

# Appendix B: Interview Preparation — GenAI Q&A

## B.1 Fundamentals

**Q: What is Generative AI?**  
A: Generative AI refers to AI systems that can create new content (text, images, code, audio) by learning patterns from training data. Unlike traditional AI which classifies or predicts, GenAI produces novel outputs.

**Q: What is the Transformer architecture?**  
A: The Transformer (2017, "Attention Is All You Need") is a neural network architecture based on self-attention mechanisms. It processes all tokens in parallel (unlike RNNs) and allows each token to attend to all others, capturing long-range dependencies.

**Q: Explain the difference between GPT and BERT.**  
A: GPT (Generative Pre-trained Transformer) is decoder-only, trained for text generation (next token prediction). BERT (Bidirectional Encoder Representations) is encoder-only, trained for understanding/classification (masked language modeling). GPT generates; BERT understands.

**Q: What are tokens?**  
A: Tokens are the basic units LLMs process. A token is approximately 4 characters or ¾ of a word in English. BPE (Byte Pair Encoding) is the most common tokenization algorithm.

**Q: What is temperature in LLM parameters?**  
A: Temperature controls randomness in output. At 0, the model is deterministic (always picks highest probability token). At 1+, it's more creative/random. For factual tasks use low temperature; for creative tasks use higher.

---

## B.2 RAG & Vector Databases

**Q: What is RAG and why is it needed?**  
A: RAG (Retrieval Augmented Generation) combines information retrieval with LLM generation. It's needed because LLMs have knowledge cutoffs, can hallucinate, and don't have access to private/current data. RAG grounds responses in retrieved facts.

**Q: Explain the RAG pipeline.**  
A: 1) Load documents, 2) Chunk into smaller pieces, 3) Embed chunks into vectors, 4) Store in vector DB. At query time: 5) Embed user query, 6) Retrieve similar chunks, 7) Inject into prompt, 8) LLM generates grounded response.

**Q: What is a vector database?**  
A: A database optimized for storing and searching high-dimensional vectors (embeddings). Unlike relational DBs that use exact matching, vector DBs use similarity metrics (cosine, euclidean) for nearest-neighbor search.

**Q: What chunking strategies do you know?**  
A: Fixed-size (N chars), sentence-based, paragraph-based, recursive (try multiple separators), semantic (topic-change boundaries), and context-aware (respects document structure like headers).

**Q: What is Hybrid Search?**  
A: Combining vector/semantic search with keyword/BM25 search. Vector captures meaning ("automobile" matches "car"); keyword captures exact terms. Results are fused using Reciprocal Rank Fusion (RRF).

---

## B.3 LangChain & LangGraph

**Q: What is LangChain?**  
A: A framework for building LLM applications with composable components — models, prompts, chains, retrievers, tools, and memory. Uses LCEL (pipe syntax) for clean composition.

**Q: What is LCEL?**  
A: LangChain Expression Language — a declarative way to compose chains using the pipe operator: `prompt | llm | parser`. Each component's output feeds into the next.

**Q: What is LangGraph?**  
A: A framework for building stateful, multi-actor AI applications as graphs. Nodes are processing steps, edges are transitions (can be conditional). Supports cycles, persistence, and human-in-the-loop.

**Q: Explain the ReAct pattern.**  
A: ReAct (Reason + Act) is an agent pattern where the LLM: 1) Reasons about what to do, 2) Chooses a tool/action, 3) Executes it, 4) Observes the result, 5) Repeats until task is complete.

**Q: How does LangGraph handle memory?**  
A: Through State schemas and Checkpointers. State defines what data flows through the graph. Checkpointers (MemorySaver, PostgresSaver) persist state across invocations, enabling multi-turn conversations and resumability.

---

## B.4 AWS & Cloud

**Q: What is AWS Bedrock?**  
A: A fully managed service providing access to foundation models (Claude, Llama, Titan) via API. Includes Knowledge Bases (managed RAG), Guardrails (safety), and Agents (orchestration).

**Q: Explain AWS Lambda for GenAI.**  
A: Lambda is serverless compute ideal for GenAI inference endpoints. Supports container images (up to 10GB), 15-min timeout, and integrates with API Gateway. Pay only for execution time.

**Q: What are Bedrock Guardrails?**  
A: Safety filters applied to LLM inputs/outputs. Include topic filtering (block off-topic requests), content filtering (toxicity, PII), word/phrase deny-lists, and hallucination detection.

---

## B.5 Architecture & Design

**Q: Design a production RAG system.**  
A: 
```
User → API Gateway → Lambda → LangGraph Agent
                                    ↓
                     ┌──────────────┼──────────────┐
                     ↓              ↓              ↓
              Vector Search    Knowledge Base   Direct LLM
              (Pinecone)       (Bedrock KB)     (Bedrock)
                     ↓              ↓              ↓
                     └──────────────┼──────────────┘
                                    ↓
                            Response + Citations
                                    ↓
                     ┌──────────────┼──────────────┐
                     ↓              ↓              ↓
                Guardrails     Logging        Caching
                (Safety)     (CloudWatch)    (DynamoDB)
```

**Q: How would you handle multi-tenancy in a GenAI app?**  
A: Separate data by tenant in vector DB (metadata filtering), use tenant-specific thread_ids for memory isolation, IAM policies for access control, and separate knowledge bases per tenant.

**Q: How do you evaluate RAG quality?**  
A: Key metrics: Retrieval Precision (relevant docs retrieved), Recall (all relevant docs found), Answer Accuracy (correctness), Faithfulness (grounded in context, no hallucination), Relevance (answers the actual question).

---
---

# 📊 Complete Diagram Reference (All Drawio Files)

## Module 1: AI-ML (1.AI-ML.drawio.html — 7 tabs)
1. INTRO
2. HOW-ALL-IT-STARTED
3. MENTAL-MODEL
4. WHAT-IS-AI
5. WHAT-IS-ML
6. EX-LINEAR-REGRESSION
7. OPT-STATS-ML

## Module 1: GenAI (2.GENAI.drawio.html — 3 tabs)
1. INTRO-GENAI
2. TIMELINE
3. LANDSCAPE

## Module 1: LLM (3.LLM.drawio.html — 9 tabs)
1. WHAT-IS-LLM
2. LLM-PROMPT
3. ARCHITECTURE
4. CONVERSATION-MEMORY
5. TOKEN-PRICING
6. CONTEXT-WINDOW
7. PROMPT-VS-CONTEXT-ENGINEERING
8. MODEL-BEHAVIOUR
9. MODEL-EVALUATION

## Module 2: IAM (IAM-ARCH.html — 4 tabs)
1. ACCOUNT CREATION
2. USERCREATIONREQUEST
3. GROUP
4. ROLES

## Module 2: EC2 (EC2-ARCH.html — 2 tabs)
1. SERVER-INTRO
2. EC2-INTRO

## Module 2: S3 (S3-ARCH.html — 1 tab)
1. S3

## Module 2: RDS (RDS.html — 1 tab)
1. RDS

## Module 2: Docker & ECR (DOCKER-N-ECR.html — 3 tabs)
1. APP-PLATFORMS
2. APP-EC2
3. DOCKER-ECR

## Module 2: API Gateway (API-GATEWAY.html — 2 tabs)
1. WHAT-IS-API-GW
2. WORKING-WITH-APIGW

## Module 4: Prompt Engineering (Diagrams as JPG)
- LLM-ARCH-BPE: WHAT-IS-LLM, LLM-PROBLEMS, LLM-ENTERPRISE-ARCH, HOW-LLM-WORKS, BITE-PAIR-ENCODING
- PROMPT-ENGG: Types, Practical Examples, Iterative Dev, Summarization, Inferring, Transformation, Expanding, Model Parameters
- PROJECT: Services Architecture, Full Architecture

## Module 5: RAG (Diagrams as PDF/JPG)
- RAG: Problem, Architecture, DB Comparison, Ingestion, Retrieval, Augmented Generation, Final Architecture, File-to-VectorDB Calc
- PINECONE-RAG: VectorDB Types, Pinecone, HuggingFace, Simple RAG, Tips, Two-Stage, Chunking, Context-Aware, Hybrid Search

## Module 6: LangChain (Diagrams as PDF)
- WHY-LANG-CHAIN, WORKING-WITH-LANGCHAIN, AGENTIC-RAG-HYBRID-SEARCH, QUERY-TRANSLATION-TECH

## Module 7: GraphDB (Diagrams as PDF)
- Intro: WHY-GRAPH-DB, NEO4J-N-CIPHER, CORE-COMPONENTS, GRAPHS-EVERYWHERE
- Cypher: LAB-SETUP, READING-DATA, FINDING-RELATIONSHIPS, FILTERING-QUERIES

## Module 8: LangGraph (STATE-N-MEMORY.drawio.html — 5 tabs)
1. STATE-SCHEMA
2. MULTIPLE-SCHEMAS
3. TRIM-N-FILTER-MESSAGES
4. CHAT-SUMMARIZATION
5. CHATBOT-WITH-EXTERNAL-MEMORY

---

# 🎓 Course Completion Checklist

| # | Module | Theory | Labs | Project | Diagrams |
|---|--------|--------|------|---------|----------|
| 1 | Intro to GenAI | ☐ | ☐ | — | ☐ 19 diagrams |
| 2 | AWS Cloud | ☐ | ☐ | ☐ Lambda+DynamoDB | ☐ 13 diagrams |
| 3 | Python | ☐ | ☐ | ☐ Banking App | ☐ |
| 4 | Prompt Engineering | ☐ | ☐ | ☐ Text-to-SQL | ☐ 17 diagrams |
| 5 | RAG | ☐ | ☐ | ☐ (via labs) | ☐ 20+ diagrams |
| 6 | LangChain | ☐ | ☐ | ☐ Agentic RAG | ☐ 4 diagrams |
| 7 | Graph DB | ☐ | ☐ | ☐ Airline QA | ☐ 8 diagrams |
| 8 | LangGraph | ☐ | ☐ | ☐ Chatbot | ☐ 14 diagrams |
| 9 | MCP | ☐ | ☐ | ☐ Travel Agent | — |
| 10 | Bedrock/AgentCore | ☐ | ☐ | ☐ Banking Bot | — |
| 11 | K8s/EKS (Sunday) | ☐ | ☐ | — | ☐ 9 diagrams |
| 12 | Final Capstone | — | — | ☐ Full Stack GenAI | — |

---

**📖 End of Book**

*Generated from DVS GenAI & Agentic AI Bootcamp materials*  
*August 2026*
